# 契約: Server Actions

**Feature**: `001-trademark-batch-check`

すべて `requireUser()` を通してから処理する。戻り値の `error` は下のエラーコードで、画面は `lib/error-messages.ts` の対応表で文言にする。

## startCheck

`apps/web/src/app/(app)/checks/actions.ts`

| 項目 | 内容 |
|---|---|
| 入力 | `FormData { candidates: string（改行区切り。各行 "候補名" または "候補名 / ヨミ"）, classes: string[]（"1"〜"45"、0 個以上） }` |
| 成功 | チェックを作り、候補ごとのジョブを登録して `/checks/{id}` へ移す。重複をまとめた場合は `/checks/{id}?merged={まとめた件数}` へ移す |
| 失敗 | `{ error: CheckErrorCode, details?: { line: number; reason: string }[], remaining?: number, limit?: number }` |

処理の順:

1. 入力が 5,000 文字または 100 行（空行を除く）を超えたら、解析せずに `INPUT_TOO_LARGE` を返す。入力を解析する（空行を除く、正規化、重複をまとめる。research R2）。まとめた件数は、移動先の URL の `merged` で結果画面に渡す（FR-003）。
2. 検証する: 不正な候補 → `INVALID_CANDIDATE`（行番号と理由。20 件まで）、候補が 0 件 → `NO_CANDIDATES`、10 件超 → `TOO_MANY_CANDIDATES`、不正な区分 → `INVALID_CLASS`。
3. トランザクション（利用者ごとのアドバイザリロック）で、実行中のチェックが 3 件以上 → `TOO_MANY_RUNNING`、残りが足りない → `QUOTA_EXCEEDED`（`remaining`、`limit` を返す）。通れば、チェック、候補、利用回数を書く。
4. コミットの後、候補ごとにジョブを登録する。登録に失敗した候補は `unknown`（`FAILED`）にして利用回数を戻す。DB も止まっていて `unknown` にできなければ、例外を外へ出さずにログだけを残す（2 分後に期限切れの処理が `unknown` にして戻す）。
5. トランザクションが DB の失敗で終わったら `FAILED` を返す。例外は外へ出さず、ログには例外の種類だけを残す（drizzle の例外は問い合わせの値＝候補名を含むため。憲章 II）。

## retryCandidate

| 項目 | 内容 |
|---|---|
| 入力 | `{ candidateId: string }` |
| 成功 | 候補を `queued` に戻し（attempt + 1、期限を今から 2 分後）、利用回数を 1 数え、ジョブを登録する。`/checks/{id}` を読み直す |
| 失敗 | 本人の候補でない → `NOT_FOUND`、`unknown` でない → `NOT_RETRYABLE`、実行中のチェックが 3 件（対象のチェックを除く）→ `TOO_MANY_RUNNING`、残りがない → `QUOTA_EXCEEDED`、DB の失敗 → `FAILED` |

## エラーコード

| コード | 表示の方針 |
|---|---|
| `NO_CANDIDATES` | 候補を 1 件以上入れるよう求める |
| `TOO_MANY_CANDIDATES` | 1 回に 10 件までであることを示す |
| `INPUT_TOO_LARGE` | 入力が長すぎることと、10 件・1 件 50 文字までであることを示す |
| `INVALID_CANDIDATE` | 行ごとに理由（長すぎる、使えない文字、読みがカタカナでない）を示す |
| `INVALID_CLASS` | 区分の選び直しを求める |
| `QUOTA_EXCEEDED` | 今月の残りの件数と、戻る日時を示す（やり直しでも、結果画面に示す） |
| `TOO_MANY_RUNNING` | 実行中のチェックが終わるまで待つよう示す |
| `NOT_FOUND` | 404 と同じ扱い |
| `NOT_RETRYABLE` | すでに結果が出ていることを示す |
| `FAILED` | 時間をおいてもう一度試すよう示す |
