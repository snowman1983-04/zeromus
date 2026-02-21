# 家計簿アプリ (Electron + SQLite)

ローカル完結で使える、入力重視の家計簿デスクトップアプリです。

## 機能

- 取引追加 / 編集 / 削除（削除確認あり）
- 月フィルタ（YYYY-MM）
- 月次サマリ（収入合計 / 支出合計 / 収支差額）
- カテゴリ別支出集計
- CSVエクスポート / CSVインポート
- SQLite永続化（Electron `userData` 配下）

## セットアップ

```bash
npm install
npm start
```

## CSVフォーマット

ヘッダー:

```text
date,type,category,amount,memo
```

例:

```text
"2026-02-01","expense","食費","1200","スーパー"
```
