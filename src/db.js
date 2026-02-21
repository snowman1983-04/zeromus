const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CATEGORIES = [
  '食費',
  '日用品',
  '交通',
  '家賃',
  '光熱費',
  '通信',
  '娯楽',
  '医療',
  '教育',
  'その他'
];

function toMonth(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日付形式が不正です');
  }
  return date.slice(0, 7);
}

function validateTransaction(input) {
  const date = String(input.date || '');
  const type = String(input.type || '');
  const category = String(input.category || '');
  const amount = Number(input.amount);
  const memo = String(input.memo || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error('日付が不正です');
  }
  if (!['income', 'expense'].includes(type)) {
    throw new Error('種別が不正です');
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error('カテゴリが不正です');
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 9999999) {
    throw new Error('金額が不正です');
  }

  return {
    date,
    month: toMonth(date),
    type,
    category,
    amount,
    memo
  };
}

function initDatabase(userDataPath) {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'kakeibo.sqlite3');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      month TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      memo TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
    CREATE INDEX IF NOT EXISTS idx_transactions_month_type ON transactions(month, type);
  `);

  return db;
}

function createRepository(db) {
  const insertStmt = db.prepare(`
    INSERT INTO transactions (id, date, month, type, category, amount, memo, createdAt, updatedAt)
    VALUES (@id, @date, @month, @type, @category, @amount, @memo, @createdAt, @updatedAt)
  `);

  const updateStmt = db.prepare(`
    UPDATE transactions
    SET date=@date, month=@month, type=@type, category=@category, amount=@amount, memo=@memo, updatedAt=@updatedAt
    WHERE id=@id
  `);

  return {
    categories: CATEGORIES,
    listByMonth(month) {
      return db
        .prepare(
          `SELECT id, date, month, type, category, amount, memo, createdAt, updatedAt
           FROM transactions
           WHERE month = ?
           ORDER BY date DESC, createdAt DESC`
        )
        .all(month);
    },
    create(payload) {
      const data = validateTransaction(payload);
      const now = new Date().toISOString();
      const row = {
        id: payload.id,
        ...data,
        createdAt: now,
        updatedAt: now
      };
      insertStmt.run(row);
      return row;
    },
    update(id, payload) {
      const data = validateTransaction(payload);
      const row = {
        id,
        ...data,
        updatedAt: new Date().toISOString()
      };
      const result = updateStmt.run(row);
      if (result.changes === 0) {
        throw new Error('取引が見つかりません');
      }
      return row;
    },
    delete(id) {
      return db.prepare('DELETE FROM transactions WHERE id = ?').run(id).changes > 0;
    },
    getMonthlySummary(month) {
      const totals = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) as incomeTotal,
             COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) as expenseTotal
           FROM transactions
           WHERE month = ?`
        )
        .get(month);

      const byCategory = db
        .prepare(
          `SELECT category, SUM(amount) as total
           FROM transactions
           WHERE month = ? AND type = 'expense'
           GROUP BY category
           ORDER BY total DESC`
        )
        .all(month);

      return {
        incomeTotal: totals.incomeTotal,
        expenseTotal: totals.expenseTotal,
        balance: totals.incomeTotal - totals.expenseTotal,
        expenseByCategory: byCategory
      };
    },
    exportCsv() {
      const rows = db
        .prepare('SELECT date, type, category, amount, memo FROM transactions ORDER BY date ASC, createdAt ASC')
        .all();
      const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const lines = ['date,type,category,amount,memo'];
      rows.forEach((r) => {
        lines.push([
          escapeCell(r.date),
          escapeCell(r.type),
          escapeCell(r.category),
          escapeCell(r.amount),
          escapeCell(r.memo)
        ].join(','));
      });
      return lines.join('\n');
    },
    importCsv(text, idFactory) {
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length <= 1) {
        return { imported: 0 };
      }

      const parseLine = (line) => {
        const cols = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
              current += '"';
              i += 1;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              current += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            cols.push(current);
            current = '';
          } else {
            current += ch;
          }
        }
        cols.push(current);
        return cols;
      };

      const insertMany = db.transaction((dataRows) => {
        let count = 0;
        dataRows.forEach((r) => {
          const data = validateTransaction(r);
          const now = new Date().toISOString();
          insertStmt.run({
            id: idFactory(),
            ...data,
            createdAt: now,
            updatedAt: now
          });
          count += 1;
        });
        return count;
      });

      const header = parseLine(lines[0]).map((h) => h.trim());
      const required = ['date', 'type', 'category', 'amount', 'memo'];
      if (required.some((name, idx) => header[idx] !== name)) {
        throw new Error('CSVヘッダーが不正です');
      }

      const payloads = lines.slice(1).map((line) => {
        const [date, type, category, amount, memo] = parseLine(line);
        return {
          date,
          type,
          category,
          amount: Number(amount),
          memo
        };
      });
      const imported = insertMany(payloads);
      return { imported };
    }
  };
}

module.exports = {
  initDatabase,
  createRepository,
  CATEGORIES
};
