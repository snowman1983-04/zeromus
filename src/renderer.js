const monthPicker = document.getElementById('monthPicker');
const prevMonth = document.getElementById('prevMonth');
const nextMonth = document.getElementById('nextMonth');
const addBtn = document.getElementById('addBtn');
const transactionsBody = document.getElementById('transactionsBody');
const incomeTotal = document.getElementById('incomeTotal');
const expenseTotal = document.getElementById('expenseTotal');
const balanceTotal = document.getElementById('balanceTotal');
const categoryList = document.getElementById('categoryList');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importCsvBtn = document.getElementById('importCsvBtn');

const dialog = document.getElementById('transactionDialog');
const form = document.getElementById('transactionForm');
const dialogTitle = document.getElementById('dialogTitle');
const deleteBtn = document.getElementById('deleteBtn');
const cancelBtn = document.getElementById('cancelBtn');
const errorText = document.getElementById('formError');
const categorySelect = document.getElementById('categorySelect');

let categories = [];
let currentEditId = null;

const formatter = new Intl.NumberFormat('ja-JP');

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toYmd(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftMonth(value, offset) {
  const [year, month] = value.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fillCategories() {
  categorySelect.innerHTML = '';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

function openDialog(transaction) {
  errorText.textContent = '';
  if (transaction) {
    currentEditId = transaction.id;
    dialogTitle.textContent = '取引編集';
    form.date.value = transaction.date;
    form.type.value = transaction.type;
    form.category.value = transaction.category;
    form.amount.value = transaction.amount;
    form.memo.value = transaction.memo;
    deleteBtn.hidden = false;
  } else {
    currentEditId = null;
    dialogTitle.textContent = '取引追加';
    form.reset();
    form.date.value = toYmd(new Date());
    form.type.value = 'expense';
    form.category.value = categories.includes('その他') ? 'その他' : categories[0];
    deleteBtn.hidden = true;
  }
  dialog.showModal();
}

function closeDialog() {
  dialog.close();
}

function validateForm(payload) {
  if (!payload.date || Number.isNaN(Date.parse(payload.date))) {
    return '日付が不正です';
  }
  if (!['income', 'expense'].includes(payload.type)) {
    return '種別を選択してください';
  }
  if (!categories.includes(payload.category)) {
    return 'カテゴリを選択してください';
  }
  const amount = Number(payload.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 9999999) {
    return '金額は1〜9,999,999の整数で入力してください';
  }
  return null;
}

function renderTransactions(items) {
  transactionsBody.innerHTML = '';

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'この月のデータはまだありません。';
    tr.appendChild(td);
    transactionsBody.appendChild(tr);
    return;
  }

  items.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.type === 'income' ? '収入' : '支出'}</td>
      <td>${t.category}</td>
      <td>¥${formatter.format(t.amount)}</td>
      <td>${(t.memo || '').replaceAll('<', '&lt;')}</td>
      <td>
        <button data-id="${t.id}" data-action="edit">編集</button>
        <button data-id="${t.id}" data-action="delete">削除</button>
      </td>
    `;
    transactionsBody.appendChild(tr);
  });
}

function renderSummary(summary) {
  incomeTotal.textContent = `¥${formatter.format(summary.incomeTotal)}`;
  expenseTotal.textContent = `¥${formatter.format(summary.expenseTotal)}`;
  balanceTotal.textContent = `¥${formatter.format(summary.balance)}`;

  categoryList.innerHTML = '';
  const totalExpense = summary.expenseTotal || 1;
  if (summary.expenseByCategory.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'データなし';
    categoryList.appendChild(li);
    return;
  }

  summary.expenseByCategory.forEach((c) => {
    const ratio = Math.round((c.total / totalExpense) * 100);
    const li = document.createElement('li');
    li.innerHTML = `<span>${c.category}</span><span>¥${formatter.format(c.total)} (${ratio}%)</span>`;
    categoryList.appendChild(li);
  });
}

async function refresh() {
  const month = monthPicker.value;
  const [items, summary] = await Promise.all([
    window.kakeiboApi.listTransactions(month),
    window.kakeiboApi.getSummary(month)
  ]);
  renderTransactions(items);
  renderSummary(summary);
}

prevMonth.addEventListener('click', () => {
  monthPicker.value = shiftMonth(monthPicker.value, -1);
  refresh();
});

nextMonth.addEventListener('click', () => {
  monthPicker.value = shiftMonth(monthPicker.value, 1);
  refresh();
});

monthPicker.addEventListener('change', refresh);
addBtn.addEventListener('click', () => openDialog(null));
cancelBtn.addEventListener('click', closeDialog);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    date: form.date.value,
    type: form.type.value,
    category: form.category.value || 'その他',
    amount: Number(form.amount.value),
    memo: form.memo.value || ''
  };

  const err = validateForm(payload);
  if (err) {
    errorText.textContent = err;
    return;
  }

  try {
    if (currentEditId) {
      await window.kakeiboApi.updateTransaction(currentEditId, payload);
    } else {
      await window.kakeiboApi.createTransaction(payload);
    }
    closeDialog();
    await refresh();
  } catch (e) {
    errorText.textContent = e.message;
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!currentEditId) {
    return;
  }
  if (!window.confirm('この取引を削除します。元には戻せません。よろしいですか？')) {
    return;
  }
  await window.kakeiboApi.deleteTransaction(currentEditId);
  closeDialog();
  await refresh();
});

transactionsBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const { id, action } = button.dataset;
  if (!id || !action) {
    return;
  }

  if (action === 'delete') {
    if (!window.confirm('この取引を削除します。元には戻せません。よろしいですか？')) {
      return;
    }
    await window.kakeiboApi.deleteTransaction(id);
    await refresh();
    return;
  }

  const transactions = await window.kakeiboApi.listTransactions(monthPicker.value);
  const current = transactions.find((t) => t.id === id);
  if (current) {
    openDialog(current);
  }
});

exportCsvBtn.addEventListener('click', async () => {
  try {
    const result = await window.kakeiboApi.exportCsv();
    if (!result.canceled) {
      window.alert(`CSVを出力しました: ${result.filePath}`);
    }
  } catch (e) {
    window.alert(`CSV出力に失敗しました: ${e.message}`);
  }
});

importCsvBtn.addEventListener('click', async () => {
  try {
    const result = await window.kakeiboApi.importCsv();
    if (!result.canceled) {
      window.alert(`${result.imported}件の取引を取り込みました。`);
      await refresh();
    }
  } catch (e) {
    window.alert(`CSV取込に失敗しました: ${e.message}`);
  }
});

(async () => {
  categories = await window.kakeiboApi.getCategories();
  fillCategories();
  monthPicker.value = todayMonth();
  await refresh();
})();
