# Research: アプリ基盤

**Feature**: `000-app-basic` | **Date**: 2026-09-23

`docs/architecture.md` で決めた技術スタック（Next.js、PostgreSQL、Drizzle ORM、Better Auth、pg-boss、Resend、VPS 上の Docker Compose）を前提に、この機能で必要な細部を決める。バージョンは 2026-09-23 に `npm view` で確かめた最新版である。

## R1. バージョンの固定

- **Decision**:
  - Node.js 22 LTS（pg-boss 12 は `>=22.12.0`）
  - Next.js 16.3、React 19
  - Better Auth 1.7.5、Drizzle ORM 0.45.3、drizzle-kit 0.31、pg 8、pg-boss 12
  - Resend SDK 6、Zod 4
  - Vitest 5、Playwright 1.63
  - TypeScript 6.0、ESLint 10、typescript-eslint
  - pnpm 11
- **Rationale**:
  - TypeScript の最新は 7.0.2 だが、typescript-eslint の peer 依存が `typescript >=4.8.4 <6.1.0` なので、6.0 系にする。
  - Better Auth 1.7.5 の peer 依存は、`next ^16`、`drizzle-orm ^0.45.2`、`drizzle-kit >=0.31.4`、`vitest ^5` を含んでおり、上の組み合わせで揃う。
- **Alternatives considered**: TypeScript 7.0 は、リンターが対応するまで見送った。

## R2. リポジトリの構成

- **Decision**: pnpm ワークスペースにする。
  - `apps/web`: Next.js。画面、Server Actions、Better Auth のエンドポイント
  - `apps/worker`: pg-boss のジョブを実行する
  - `packages/db`: Drizzle のスキーマ、マイグレーション、DB クライアント
  - `packages/mail`: メールの文面と送信手段のアダプタ
  - `packages/shared`: ログ、設定、時刻などの共通処理
- **Rationale**:
  - `docs/architecture.md` §3 は、`web`、`worker`、`importer` の 3 つの実行単位でスキーマと型を共有する前提である。
  - この機能では、メールの再送と定期の掃除に `worker` が必要になる。`importer` は `001` で足す。
- **Alternatives considered**: 単一パッケージにする案。`worker` と `web` が同じ依存を抱え、Docker イメージが大きくなるため採らない。

## R3. 認証の方式（Better Auth の設定）

- **Decision**:
  - `emailAndPassword`
    - `enabled: true`、`requireEmailVerification: true`、`minPasswordLength: 8`
    - `resetPasswordTokenExpiresIn: 3600`（1 時間、FR-010）
    - `revokeSessionsOnPasswordReset: true`（FR-011）
  - `emailVerification`
    - `sendOnSignUp: true`、`autoSignInAfterVerification: true`
    - `expiresIn: 86400`（24 時間、FR-003）
  - `socialProviders.google`
  - `account.accountLinking`
    - `enabled: true`
    - `trustedProviders` は空にする（Google 側で確認済みのメールだけを結びつける既定の動作に任せる。FR-005a）
    - `allowDifferentEmails: false`
  - `user.changeEmail.enabled: true`（新しいアドレスの確認を経て反映する。FR-012）
  - `user.deleteUser.enabled: true`（FR-015）
  - `session`
    - `expiresIn: 30 日`、`updateAge: 1 日`（FR-008a）
    - `freshAge: 0`。再認証は R6 の独自の仕組みで判定する
  - `user.additionalFields`: `role`（`user` / `operator`、既定は `user`、入力不可）、`status`（`active` / `suspended`、既定は `active`、入力不可）
- **Rationale**:
  - 仕様の要件の大部分を、Better Auth の標準の設定で満たせる（https://www.better-auth.com/docs/authentication/email-password 、https://www.better-auth.com/docs/concepts/users-accounts 、https://www.better-auth.com/docs/concepts/session-management 、参照日 2026-09-23）。
  - `updateAge: 1 日` だと、ログイン状態は 1 日単位で延長される。「操作のたびに延長」（FR-008a）との誤差は最大 1 日である。延長のたびに DB へ書き込むのを避けるため、これを許容する。
- **Alternatives considered**:
  - Clerk（SaaS）: `docs/architecture.md` で却下済みである。
  - Auth.js: パスワードの再設定、メールの変更、退会の流れを自前で作る必要があるため採らない。

## R4. 試行の制限（FR-008、FR-004）

- **Decision**: 2 段で制限する。
  1. **接続元ごと**: Better Auth の `rateLimit` を使う。
     - `storage: "database"` にする。再起動で数え直しにならないようにするためである。
     - `customRules`:
       - `/sign-in/email` と `/request-password-reset` は `{ window: 900, max: 10 }`
       - `/send-verification-email` は `{ window: 3600, max: 3 }`
     - 接続元は、Caddy が付ける `x-forwarded-for` で判定する（`advanced.ipAddress`）。
  2. **アカウントごと**: 独自に実装する。
     - Better Auth の `hooks.before` で、上の 3 つのパスについて、入力されたメールアドレスの SHA-256 をキーに、`rate_limit_buckets` テーブルで数える。
     - 15 分に 10 回（確認メールの送り直しは 1 時間に 3 回）を超えたら、`429` とエラーコード `TOO_MANY_ATTEMPTS` を返す。
- **Rationale**:
  - Better Auth の `rateLimit` は、接続元とパスの組でしか数えない（https://www.better-auth.com/docs/concepts/rate-limit 、参照日 2026-09-23）。
  - 仕様は、アカウントごとの制限も求めている。
  - キーをハッシュにすることで、テーブルにメールアドレスを残さない。
- **Alternatives considered**: 失敗の回数だけを数える案。仕様（Clarifications Round 2）が「試行」を数えるので採らない。

## R5. 漏えいパスワードの確認（FR-002）

- **Decision**: 自前のアダプタ `PwnedPasswordChecker` を作る。
  - Have I Been Pwned の k-匿名性の API（SHA-1 の先頭 5 文字だけを送る）を使う。
  - タイムアウトは 3 秒とする。API が失敗した場合は、確認を省いて受け付け、警告のログを残す（fail-open）。
  - サインアップ、パスワードの再設定、パスワードの変更の `hooks.before` で呼ぶ。
  - 漏えいが見つかれば `PASSWORD_COMPROMISED` を返す。
- **Rationale**:
  - Better Auth の `haveIBeenPwned` プラグインでも確認はできる（https://www.better-auth.com/docs/plugins/have-i-been-pwned 、参照日 2026-09-23）。ただし、タイムアウトと障害時の振る舞いを設定できることを、ドキュメントで確認できなかった。
  - 憲章 III（外部サービスの呼び出しにタイムアウトを設け、失敗を全体の失敗にしない）を確実に満たすため、自前にする。
- **Alternatives considered**: 障害時に拒否する案（fail-closed）。外部の障害でサインアップが止まるため採らない。

## R6. 再認証（Clarifications Round 1）

- **Decision**:
  - セッションに `reauthenticatedAt` を持たせる（Better Auth の session の追加フィールド）。
  - **パスワードでログインできる利用者**: 独自の Server Action `reauthenticate(password)` でパスワードを照合する。照合には、Better Auth の `ctx.context.password.verify` を使う独自エンドポイント `/reauth/password` を設ける。成功したら `reauthenticatedAt` を今にする。
  - **Google だけの利用者**: Google でのログインし直し（`signIn.social` に `prompt: "login"`）を求める。戻ってきたら `reauthenticatedAt` を今にする。
  - **退会とメールアドレスの変更の Server Action**: `reauthenticatedAt` が 10 分以内でなければ `REAUTH_REQUIRED` を返す。
- **Rationale**:
  - Better Auth の `deleteUser` はパスワードを受け取れる。しかし、`changeEmail` はパスワードを受け取らない。
  - 2 つの操作と 2 種類のログイン手段で同じ判定にするため、独自に持つ。
- **Alternatives considered**: `freshAge` だけで判定する案。ログインの直後は、いつでも再認証なしで通ってしまうため採らない。

## R7. サインアップ時の同意（FR-017、FR-019、FR-020）

- **Decision**:
  - 規約の本文と版は、リポジトリの `apps/web/content/legal/{terms,privacy}/<version>.md` で管理する。現行の版は `legal/registry.ts` の定数で示す。
  - サインアップの画面の同意のチェックが入ったら、HttpOnly の短命な Cookie `pending_consent`（現行の版、10 分）を発行する。
  - Better Auth の `databaseHooks.user.create.before` で `pending_consent` を確かめる。なければ `CONSENT_REQUIRED` で作成を拒否する。これで FR-017 を Google の初回登録にも適用できる。
  - `databaseHooks.user.create.after` で、同意の履歴（`consents`）に記録する。
  - ログイン後のすべての画面で、現行の版への同意がそろっているかを確かめる。そろっていなければ `/consent` へ移す（FR-019）。
- **Rationale**:
  - Google の登録では、OAuth から戻った時点でアカウントが作られる。そのため、同意を先に受け取り、作成の直前に確かめる必要がある。
  - 規約の本文をリポジトリで管理すると、改定の履歴が Git に残る。
- **Alternatives considered**: 作成後に同意を求める案。FR-017（同意しない限りアカウントを作らない）に反するため採らない。

## R8. メール送信（FR-022、FR-023、SC-008）

- **Decision**:
  - Better Auth の各 `send*` コールバックは、pg-boss のキュー `send-email` にジョブを入れるだけにする。
    - ジョブのデータは、種類、宛先、リンクの URL、`outbound_emails` の ID である。
    - 設定は `retryLimit: 5`、`retryDelay: 30`、`retryBackoff: true` とし、完了したジョブは 1 日で削除する。
  - `worker` が `packages/mail` の `MailTransport` で送る。
    - 本番は `ResendTransport` を使う。
    - 開発とテストは `FileTransport` で、`.mail-outbox/` に JSON を書く。E2E テストは、ここからリンクを読む。
  - 送信の状態（待ち、送信済み、失敗）と再送の回数は、`outbound_emails` に記録する。本文とリンクは記録しない。
  - 最後まで失敗したら、`error` レベルのログを出す。運営者への通知は、999 の監視（Sentry）がこのログを拾う。
- **Rationale**:
  - 送信をジョブにすることで、Resend が止まっても自動で再送できる。バックオフは 30 秒、60 秒、120 秒…と伸び、5 回の合計は 15 分を下回るので、SC-008 を満たせる。
  - リンク（トークン）を DB に長く残さないようにする。
- **Alternatives considered**: Resend を同期で呼ぶ案。障害時に再送できないため採らない。

## R9. ロールと停止（FR-024〜FR-027）

- **Decision**:
  - `user.role` と `user.status` を、Better Auth の追加フィールドにする。
  - `databaseHooks.session.create.before` で、`status = suspended` ならセッションの作成を拒否する（`ACCOUNT_SUSPENDED`）。
  - ログイン後の画面とサーバー処理の入口（`requireUser()`）で毎回 `status` を確かめる。停止されていれば、そのセッションを失効させて `/suspended` へ移す。
  - 運営者の画面の入口（`requireOperator()`）では、`role` を確かめる。
  - 運営者のロールは、CLI（`pnpm --filter @app/web ops:grant-operator <email>`）でだけ付与する（FR-027）。
- **Rationale**:
  - `requireUser()` で毎回 DB の `status` を読むことで、停止を次の操作から反映できる（US6-4）。
  - Better Auth の `admin` プラグインには利用者の停止の仕組みもある。ただし、運営者の画面の中身は `005` の範囲なので、000 では最小の追加フィールドにとどめる。
- **Alternatives considered**: Better Auth の `admin` プラグインを使う案。`005` で運営者の画面を作るときに、改めて検討する。

## R10. メンテナンス表示（FR-028）

- **Decision**:
  - 環境変数 `MAINTENANCE_MODE=1` のとき、Next.js の `proxy.ts`（旧 middleware）が、`/maintenance` と静的ファイル以外へのリクエストを `/maintenance` に書き換え、HTTP 503 を返す。
  - 切り替えは、`web` コンテナを環境変数付きで再起動して行う。
- **Rationale**: 計画停止（NFR-AV-003）は運営者の作業に合わせて行うので、再起動で切り替えれば足りる。
- **Alternatives considered**:
  - DB のフラグを毎回読む案。リクエストのたびに DB を読む費用に見合わないため採らない。
  - `web` 自体が止まっているときの表示は、Caddy で行う。これは `999` の範囲である。

## R11. 認証の記録（FR-031、FR-032）

- **Decision**:
  - `auth_events` テーブルに記録する。項目は、種類、日時、接続元の IP、User-Agent、`user_id` である。
  - `user_id` は `ON DELETE SET NULL` にし、退会すると本人と結びつかなくなるようにする。
  - メールアドレスは記録しない。存在しないアドレスでのログインの失敗は、`user_id` を NULL にして記録する。
  - 記録は、Better Auth の `hooks.after` で、パスと返り値（成功、`APIError`）から判定する。
  - `worker` の定期ジョブで、90 日を過ぎたものを毎日削除する。
- **Rationale**: 退会後に本人を特定できる情報を残さない（憲章 II）。
- **Alternatives considered**: アプリのログにだけ残す案。仕様（Round 2）で「記録する（90 日）」と決めたため採らない。

## R12. 定期の掃除（FR-003a）

- **Decision**: pg-boss の `schedule` で、毎日 03:00（JST）に次を実行する。
  - `cleanup-unverified-users`: 未確認かつ登録から 7 日を過ぎ、Google のログイン手段を持たないアカウントを削除する。
  - `prune-auth-events`: 90 日を過ぎた認証の記録を削除する。
  - `prune-outbound-emails`: 30 日を過ぎたメールの記録を削除する。
  - `prune-rate-limit-buckets`: 期限を過ぎた試行の記録を削除する。
- **Rationale**: `docs/architecture.md` §3 で、定期実行は pg-boss のスケジュールを使うと決めた。

## R13. テストの方針（憲章 V）

- **Decision**:
  - **単体テスト（Vitest）**: 試行の制限、同意の判定、Google だけのアカウントの制限、再認証の判定、漏えいパスワードの確認（HTTP はモック）、掃除の対象の選び方、認証の記録の判定を、テストファーストで書く。
  - **結合テスト（Vitest と実際の PostgreSQL）**: Better Auth の設定と hooks を通した、サインアップ、確認、ログイン、再設定、メールの変更、退会（関連データの削除を含む）、停止を確かめる。Google は、OAuth のトークンの交換をモックした結合テストで確かめる。
  - **E2E テスト（Playwright）**: US1、US3、US4、US5、US6 の主な流れを、`FileTransport` のメールを使って確かめる。Google のログインは E2E の対象外とし、`quickstart.md` の手動確認で行う。
  - **CI（GitHub Actions）**: PostgreSQL をサービスとして起動し、lint、typecheck、単体・結合テスト、E2E テストを実行する（FR-029）。
- **Rationale**: 本物の Google を CI で動かすことはできない。そのため、結合テストのモックと手動確認で補う。
- **Alternatives considered**: DB をモックする案。Better Auth の hooks と制約（ON DELETE CASCADE）の検証にならないため採らない。

## R14. ログ

- **Decision**:
  - pino で JSON のログを出す。
  - 機密の項目（`password`、`token`、`session`、`cookie`、`authorization`、`email`、`candidate`）は、`redact` で伏せる。
  - アプリのログのローテーション（30 日）は、Docker のログ設定で行う（`999`）。
- **Rationale**: NFR-SE-004 と FR-030 を、個々の書き忘れに頼らず満たすため。
- **Alternatives considered**: `console` を使う案。伏せ字を強制できないため採らない。
