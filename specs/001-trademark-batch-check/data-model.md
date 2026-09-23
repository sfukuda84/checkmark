# Data Model: 候補名の一括チェックと商標照合

**Feature**: `001-trademark-batch-check`

スキーマは `packages/db/src/schema/checks.ts`（チェック、候補、結果、利用回数、設定）と `packages/db/src/schema/trademarks.ts`（商標データ）に置く。時刻はすべて `timestamptz` で持ち、画面では日本時間で示す。

## 1. trademark_datasets（商標データ）

取り込みの 1 回分。照合には `status = 'active'` の最新の 1 件を使う。

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| source | text | NOT NULL | 取得元（例: `jpo-bulk`、`fixture`） |
| as_of_date | date | NOT NULL | 基準日（どの時点までの出願・登録を含むか）。FR-015 |
| imported_at | timestamptz | NOT NULL | 取り込みを終えた日時 |
| mode | text | NOT NULL, `full` / `delta` | 全件か差分か |
| row_count | integer | NOT NULL | 取り込んだ行数 |
| status | text | NOT NULL, `importing` / `active` / `failed` | |

状態の遷移: `importing` → `active`（成功）または `failed`。新しい `active` ができても古い行は残す（履歴）。

## 2. trademark_marks（商標）

権利が存続している文字商標だけを持つ（FR-010a）。

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| application_number | text | PK | 出願番号（例: `2024-012345`） |
| registration_number | text | NULL 可 | 登録番号（登録済みのとき） |
| mark_text | text | NOT NULL | 表示用の商標の文字 |
| normalized_text | text | NOT NULL, btree 索引 | research R2 の正規化後の文字。同一の判定に使う |
| holder_name | text | NOT NULL | 権利者（登録）または出願人 |
| classes | smallint[] | NOT NULL, GIN 索引, 各値 1〜45 | 区分 |
| status | text | NOT NULL, `pending` / `registered` | 出願中・登録 |
| updated_at | timestamptz | NOT NULL | 最後に取り込んだ日時 |

## 3. trademark_readings（称呼）

1 つの商標は複数の称呼を持てる。

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| application_number | text | FK → trademark_marks ON DELETE CASCADE | |
| reading | text | NOT NULL | 称呼（カタカナ） |
| reading_key | text | NOT NULL, GIN（gin_trgm_ops）と btree（text_pattern_ops）の索引 | 称呼キー（research R4） |

PK は (application_number, reading)。拡張 `pg_trgm` をマイグレーションで有効にする。短いキーの補いのため、`(left(reading_key, 1), length(reading_key))` の式索引も置く。

## 4. checks（チェック）

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 結果画面の URL に使う |
| user_id | text | NOT NULL, FK → user.id ON DELETE CASCADE, 索引 (user_id, created_at desc) | 実行した本人（FR-030、FR-033） |
| classes | smallint[] | NOT NULL, 既定 `{}` | 選んだ区分。空は全区分（FR-005） |
| created_at | timestamptz | NOT NULL | 実行した日時（FR-007） |

チェックの状態（実行中・完了）は保存しない。候補の状態から導く（1 件でも `queued` か `running` があれば実行中）。

## 5. check_candidates（候補）

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ジョブのデータに入れるのはこの ID だけ |
| check_id | uuid | NOT NULL, FK → checks ON DELETE CASCADE | |
| position | smallint | NOT NULL, (check_id, position) 一意 | 並び順（入力順） |
| input_text | text | NOT NULL | 入力した文字（前後の空白を除いたもの） |
| user_reading | text | NULL 可 | 利用者が添えた読み（FR-004a） |
| normalized_text | text | NOT NULL, (check_id, normalized_text) 一意 | FR-003 |
| reading | text | NULL 可 | 照合に使った読み。推定の前は NULL |
| reading_estimated | boolean | NOT NULL, 既定 false | FR-014 |
| status | text | NOT NULL, `queued` / `running` / `done` / `unknown` | |
| attempt | smallint | NOT NULL, 既定 1 | 何回目の実行か（やり直しで増える） |
| deadline_at | timestamptz | NOT NULL, 索引 (status, deadline_at) | 実行（やり直し）から 2 分後。FR-021 |
| charged | boolean | NOT NULL | 今の実行で利用回数を数えているか |
| charged_period | text | NOT NULL | 数えた期間（`YYYY-MM`） |
| updated_at | timestamptz | NOT NULL | |

状態の遷移:

```text
queued → running → done
queued / running → unknown（再試行の使い切り、期限切れ、データなし）
unknown → queued（やり直し。attempt を 1 増やし、期限を延ばし、利用回数を 1 数える）
```

- `done` と `unknown` は終わった状態である。`unknown` に移るとき、`charged` が true なら false にして、`charged_period` の利用回数から 1 引く（FR-026a）。
- 結果を書くのは `status in ('queued','running')` かつ `attempt` がジョブの値と同じときだけにする（期限切れの後や、やり直しの後に来た古い結果を捨てる）。

## 6. trademark_results（商標照合結果）

候補ごとに 1 行。やり直しで置き換える。

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| candidate_id | uuid | PK, FK → check_candidates ON DELETE CASCADE | |
| outcome | text | NOT NULL, `identical` / `similar` / `none` / `unknown` | FR-013 |
| matches | jsonb | NOT NULL, 既定 `[]` | 該当商標の写し（下記）。同一を先に、次に類似を度合いの高い順 |
| dataset_as_of | date | NULL 可 | 調べた商標データの基準日（FR-015） |
| checked_at | timestamptz | NOT NULL | 調べた日時 |
| reading_unavailable | boolean | NOT NULL, 既定 false | 読みが得られず類似を調べなかった（research R3） |
| identical_overflow | boolean | NOT NULL, 既定 false | 同一の商標が 100 件を超えた（research R4） |
| error_code | text | NULL 可 | `unknown` の理由（`TIMEOUT`、`NO_DATASET`、`FAILED`） |

`matches` の要素（調べた時点の写し。憲章 IV）:

```ts
{
  kind: "identical" | "similar";
  applicationNumber: string;
  registrationNumber: string | null;
  markText: string;
  reading: string | null;   // 一致した称呼
  holderName: string;
  classes: number[];
  status: "pending" | "registered";
  score: number;            // 0〜1。同一は 1
}
```

## 7. usage_counters（利用回数）

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | text | FK → user.id ON DELETE CASCADE | |
| period | text | `YYYY-MM`（日本時間） | |
| used | integer | NOT NULL, `>= 0` | 使った候補数 |

PK は (user_id, period)。残り = 上限値 − used（0 未満にしない）。次に戻る日時 = 翌月 1 日 0 時（日本時間）。

## 8. app_settings（設定）

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| key | text | PK | 例: `usage.monthly_candidate_limit` |
| value | jsonb | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

この機能では読むだけにする。行がなければ既定値（50）を使う。変更は `005-operator-console` で作る。

## 9. 区分（静的データ）

第 1 類〜第 45 類の番号と説明を、`packages/trademark/src/classes.ts` に定数で持つ（DB に置かない）。説明は、ニース分類の類見出しを短くまとめたものにする。

## 10. 削除と機密性

- 退会（`000-app-basic` FR-016）: `user` の削除で、checks → check_candidates → trademark_results と usage_counters が連鎖して消える。
- チェックの削除（`004-check-history`）: checks の行を消せば、候補と結果が連鎖して消える。
- 商標データ（trademark_*）は公開の情報であり、利用者と結びつかない。バックアップの対象から外してよい（NFR-DA-005）。
