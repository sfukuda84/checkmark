# Data Model: アプリ基盤

**Feature**: `000-app-basic` | **Date**: 2026-09-23

データベースは PostgreSQL、スキーマは Drizzle ORM（`packages/db/src/schema/`）で定義する。Better Auth が使うテーブル（`user`、`session`、`account`、`verification`、`rate_limit`）は、Better Auth の Drizzle アダプタの形に合わせる。pg-boss のテーブルは、pg-boss が自分のスキーマ（`pgboss`）に作る。

時刻はすべて `timestamptz`（UTC）で持つ。ID は、Better Auth のテーブルでは Better Auth が生成する文字列、独自のテーブルでは UUID v7 とする。

## 1. user（アカウント）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | text | PK | Better Auth が生成する |
| email | text | NOT NULL、UNIQUE | 小文字に正規化して保存する |
| email_verified | boolean | NOT NULL、既定 false | メールアドレスの確認状態 |
| name | text | NOT NULL、既定 '' | Better Auth が必須とする項目。画面には出さない |
| image | text | NULL | Google のプロフィール画像。使わない |
| role | text | NOT NULL、既定 'user'、CHECK (role IN ('user','operator')) | FR-024 |
| status | text | NOT NULL、既定 'active'、CHECK (status IN ('active','suspended')) | FR-024、FR-026 |
| created_at | timestamptz | NOT NULL | 登録日時 |
| updated_at | timestamptz | NOT NULL | |

- インデックス: `(email_verified, created_at)`。未確認のアカウントの掃除（FR-003a）に使う。
- 状態の遷移（`status`）: `active` → `suspended`（運営者が停止する。`005`）→ `active`（再開する）。000 では遷移を起こす画面を作らない。
- `role` の変更は CLI でだけ行う（FR-027）。

## 2. session（ログイン状態）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | text | PK | |
| user_id | text | NOT NULL、FK → user.id ON DELETE CASCADE | |
| token | text | NOT NULL、UNIQUE | Cookie で渡す値。ログに出さない |
| expires_at | timestamptz | NOT NULL | 最後の延長から 30 日（FR-008a） |
| ip_address | text | NULL | |
| user_agent | text | NULL | |
| reauthenticated_at | timestamptz | NULL | 再認証をした日時（research R6）。10 分以内なら退会とメール変更を許す |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

- パスワードの再設定（FR-011）と停止（FR-026）で、その利用者のセッションをすべて削除する。

## 3. account（ログイン手段）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | text | PK | |
| user_id | text | NOT NULL、FK → user.id ON DELETE CASCADE | |
| provider_id | text | NOT NULL | `credential`（メールとパスワード）か `google` |
| account_id | text | NOT NULL | Google の利用者 ID、または user.id |
| password | text | NULL | `credential` のときのハッシュ。ログに出さない |
| access_token、refresh_token、id_token | text | NULL | Google のトークン。使わないが Better Auth が保存する |
| access_token_expires_at、refresh_token_expires_at | timestamptz | NULL | |
| scope | text | NULL | |
| created_at、updated_at | timestamptz | NOT NULL | |

- 一意制約: `(provider_id, account_id)`
- 1 つの user に `credential` と `google` の両方を持てる（FR-005a）。
- **Google だけのアカウント**: `provider_id = 'credential'` の行を持たない user。この場合、メールアドレスの変更とパスワードの設定を拒否する（FR-012a）。

## 4. verification（確認用のリンク）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | text | PK | |
| identifier | text | NOT NULL | 確認・再設定・変更の対象 |
| value | text | NOT NULL | トークン。ログに出さない |
| expires_at | timestamptz | NOT NULL | 確認と変更は 24 時間、再設定は 1 時間 |
| created_at、updated_at | timestamptz | NOT NULL | |

- 使ったら削除する（1 回限り、FR-010）。

## 5. rate_limit（接続元ごとの試行の制限。Better Auth が使う）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | text | PK | |
| key | text | NOT NULL、UNIQUE | 接続元とパスの組 |
| count | integer | NOT NULL | |
| last_request | bigint | NOT NULL | ミリ秒 |

## 6. rate_limit_buckets（アカウントごとの試行の制限）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| key | text | PK | `<action>:<sha256(小文字のメールアドレス)>`。メールアドレスそのものは持たない |
| count | integer | NOT NULL | 窓の中の試行回数 |
| window_started_at | timestamptz | NOT NULL | |
| expires_at | timestamptz | NOT NULL | 窓の終わり。掃除（R12）に使う |

- `action` は、`sign-in`、`password-reset`、`resend-verification` のいずれかである。窓の長さと上限は FR-008 と FR-004 に従う。

## 7. consents（同意の履歴）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | text | NOT NULL、FK → user.id ON DELETE CASCADE | |
| document | text | NOT NULL、CHECK (document IN ('terms','privacy')) | |
| version | text | NOT NULL | 例: `2026-09-23` |
| agreed_at | timestamptz | NOT NULL | |

- 一意制約: `(user_id, document, version)`
- 現行の版は、コード（`apps/web/src/legal/registry.ts`）で定める。**規約の版**のエンティティは DB に持たず、リポジトリで管理する（research R7）。
- 判定: 利用者は、すべての `document` について現行の版の行を持つときに限り、同意済みとする（FR-019）。

## 8. auth_events（認証の記録）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| type | text | NOT NULL、CHECK | `sign_in_succeeded`、`sign_in_failed`、`password_reset`、`email_changed`、`account_deleted`、`sign_in_rejected_suspended` |
| user_id | text | NULL、FK → user.id ON DELETE SET NULL | 退会後は NULL になり、本人と結びつかない（FR-032） |
| ip_address | text | NULL | |
| user_agent | text | NULL | |
| occurred_at | timestamptz | NOT NULL | |

- インデックス: `(occurred_at)`。90 日を過ぎたものの削除（FR-031）に使う。
- メールアドレス、候補名、パスワード、トークンは持たない。
- `account_deleted` は、削除の直前に記録する。削除によって `user_id` は NULL になる。

## 9. outbound_emails（送信するメール）

| 項目 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | text | NULL、FK → user.id ON DELETE CASCADE | |
| kind | text | NOT NULL、CHECK | `verify_email`、`reset_password`、`change_email_verify`、`change_email_notice`、`reset_password_google_only` |
| status | text | NOT NULL、CHECK (status IN ('pending','sent','failed')) | |
| attempts | integer | NOT NULL、既定 0 | 再送の回数 |
| last_error | text | NULL | 送信先サービスのエラーの要約。宛先と本文は含めない |
| created_at、updated_at | timestamptz | NOT NULL | |

- 宛先、本文、リンクは持たない（ジョブのデータにだけ入れ、ジョブは完了から 1 日で消える。research R8）。
- 30 日を過ぎたら削除する。

### 状態の遷移

```text
pending --送信成功--> sent
pending --失敗（再送が残っている）--> pending（attempts + 1）
pending --失敗（再送を使い切った）--> failed
```

## 10. 退会による削除（FR-016）

退会すると、`user` の行を 1 つのトランザクションで削除する。関連するデータは、次のように扱われる。

| テーブル | 扱い |
|---|---|
| session、account、consents、outbound_emails | ON DELETE CASCADE で削除される |
| auth_events | user_id が NULL になる |
| verification | identifier が本人のメールアドレスのものを、同じトランザクションで削除する |
| rate_limit_buckets | 本人と結びつく ID を持たないので扱わない。期限で消える |
| 後続の機能のテーブル（チェック、候補、結果） | `user_id` を FK → user.id ON DELETE CASCADE にすることを、後続の機能の `plan.md` で守る |
