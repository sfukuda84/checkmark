# 契約: ジョブと CLI

**Feature**: `001-trademark-batch-check`

## 1. キュー

`packages/shared/src/queues.ts` に足す。

| キュー | データ | 設定 | 処理 |
|---|---|---|---|
| `trademark-check` | `{ candidateId: string, attempt: number }` | retryLimit 1、retryDelay 5 秒、expireInSeconds 30、deleteAfterSeconds 1 日 | 候補の照合（下記） |
| `expire-trademark-checks` | なし（定期、毎分） | retryLimit 1 | 期限を過ぎた `queued` / `running` の候補を `unknown`（`TIMEOUT`）にし、利用回数を戻す |

ジョブのデータに候補名を入れない（憲章 II）。

## 2. trademark-check の処理

1. 候補を読む。ない（退会・削除済み）、または `attempt` が違う、または終わった状態なら、何もせずに終える。
2. 候補を `running` にする。
3. 読みを決める（research R3）。
4. 有効な商標データがなければ、`unknown`（`NO_DATASET`）にして利用回数を戻す。
5. 同一と類似を探す（research R4、選んだ区分で絞る）。
6. 1 トランザクションで、結果を書き、候補を `done` にする（状態と attempt を条件にした更新。0 行なら結果を捨てる）。
7. 例外は再試行に回す。最後の試行でも失敗したら `unknown`（`FAILED`）にして利用回数を戻す。

ログには `candidateId`、`attempt`、所要時間、該当件数だけを出す。

## 3. 取り込み CLI（apps/importer）

```bash
pnpm --filter @app/importer import -- --file <path.tsv> --as-of <YYYY-MM-DD> [--mode full|delta] [--source jpo-bulk|fixture]
pnpm --filter @app/importer seed-fixture   # 検証用データを取り込む（開発・テスト用）
```

- 終了コード: 0 成功、1 失敗（データセットを `failed` にし、前の `active` を使い続ける）。
- 取り込み用 TSV（UTF-8、1 行目は見出し）の列:

| 列 | 必須 | 内容 |
|---|---|---|
| `application_number` | ○ | 出願番号 |
| `registration_number` | | 登録番号 |
| `mark_text` | ○ | 表示用の商標の文字 |
| `readings` | | 称呼（カタカナ）。複数は `;` で区切る |
| `holder_name` | ○ | 権利者または出願人 |
| `classes` | ○ | 区分の番号。複数は `,` で区切る |
| `status` | ○ | `pending`、`registered`、`dead` のいずれか |

- `mode=full`: 取り込み用 TSV にない商標を削除する。`mode=delta`: 行ごとに追加・更新し、`dead` の行はその商標を削除する。
- 特許庁の一括ダウンロードの TSV を取り込み用 TSV に変換する処理（`JpoBulkMapping`）は、項目定義書を入手してから実装する（research R1。申込が通るまでは、この CLI は取り込み用 TSV だけを受け付ける）。
