# 商標データの取り込み手順

`001-trademark-batch-check` の照合に使う商標データ（`trademark_marks`、`trademark_readings`）を取り込む手順である（NFR-OP-006）。取り込みは `apps/importer` の CLI で行う。

## 前提

- 特許庁の一括ダウンロードサービスの利用申込（`docs/architecture.md` §9 R1）が通っていることが、本番公開の前提条件である。
- 申込が通るまでは、検証用データ（`apps/importer/fixtures/sample-trademarks.tsv`）だけを使う。
- 特許庁の TSV を取り込み用 TSV に変える変換（`JpoBulkMapping`）は、申込の後に項目定義書に合わせて作る。まだ作っていない（research R1）。

## 検証用データを取り込む（開発・テスト）

```bash
DATABASE_URL=postgres://app:app@localhost:55433/app pnpm --filter @app/importer seed-fixture
# 基準日を指定する場合
DATABASE_URL=... pnpm --filter @app/importer seed-fixture -- --as-of 2026-09-20
```

## 取り込み用 TSV を取り込む

```bash
DATABASE_URL=... pnpm --filter @app/importer import -- --file <path.tsv> --as-of <YYYY-MM-DD> --mode full
DATABASE_URL=... pnpm --filter @app/importer import -- --file <path.tsv> --as-of <YYYY-MM-DD> --mode delta
```

- 列の定義は `specs/001-trademark-batch-check/contracts/jobs-and-cli.md` §3 にある。
- `--as-of` には、データに含まれる出願・登録の最終日（基準日）を指定する。画面に「基準日」として出る。
- `full` は、ファイルにない商標を削除する。`delta` は、行ごとに追加・更新し、`dead` の行の商標を削除する。
- 取り込みは 1 トランザクションで行う。終わるまでは前のデータで照合が続くので、メンテナンス表示は要らない。長時間になる場合だけ、`MAINTENANCE_MODE=1` を使う（NFR-AV-003）。
- 失敗したら、終了コード 1 で終わり、そのデータセットは `failed` になる。前のデータのまま照合が続く。

## 頻度

- 差分（`delta`）を、開庁日ごとまたは週ごとに手作業で落として取り込む（`docs/architecture.md` §2.1）。
- 基準日が 30 日を超えて古くなると、結果の画面に注意が出る（FR-015a）。30 日を超えないように取り込む。

## 確かめる

```sql
select as_of_date, status, row_count, imported_at from trademark_datasets order by imported_at desc limit 5;
select count(*) from trademark_marks;
```

## バックアップ

商標データは再取り込みで戻せるため、バックアップの対象から外してよい（NFR-DA-005）。
