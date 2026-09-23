# Quickstart: アプリ基盤

**Feature**: `000-app-basic`

この機能が動くことを確かめる手順である。実装の詳細は `tasks.md` を参照する。

## 前提

- Node.js 22 LTS、pnpm 11、Docker（Compose v2）
- `.env.example` をコピーした `.env`（開発では `MAIL_TRANSPORT=file`）
- Google のログインを手動で確かめる場合だけ、Google Cloud の OAuth クライアント（リダイレクト URI は `http://localhost:3000/api/auth/callback/google`）

## セットアップ

```bash
pnpm install
docker compose -f compose.dev.yaml up -d   # PostgreSQL
pnpm db:migrate
pnpm dev                                   # web（:3000）と worker を起動する
```

## 自動テスト

```bash
pnpm lint
pnpm typecheck
pnpm test          # 単体テストと結合テスト（PostgreSQL が必要）
pnpm test:e2e      # Playwright（web と worker を起動して実行する）
```

期待する結果: すべて成功する。CI（`.github/workflows/ci.yml`）でも、PR ごとに同じ 4 つが実行され、失敗すると PR をマージできない（FR-029。ブランチ保護の設定は手順 7）。

## 手動の確認シナリオ

メールは `MAIL_OUTBOX_DIR`（既定は `.mail-outbox/`）に JSON で出力される。

1. **サインアップと確認（US1）**
   - `/sign-up` で、同意のチェックを入れずに送信する。→ `CONSENT_REQUIRED` が表示される。
   - チェックを入れ、`password123` で送信する。→ 漏えいパスワードとして拒否される。
   - 十分に強いパスワードで送信する。→ `/verify-email` に移り、`.mail-outbox/` に確認メールが出る。
   - メールのリンクを開く。→ ログインした状態で `/` が表示される。
2. **ログインとログアウト（US1）**
   - ログアウトしてから、誤ったパスワードで 11 回ログインする。→ 11 回目は「しばらく待ってからお試しください」になる。
   - 15 分後（またはテストでは時計を進めて）、正しいパスワードでログインできる。
3. **パスワードの再設定（US3）**
   - `/forgot-password` で、登録済みと未登録のアドレスを入力する。→ 同じ案内が出る。
   - 登録済みのアドレスに届いたリンクで、新しいパスワードを設定する。→ 別のブラウザのログイン状態が解除される。
   - 同じリンクをもう一度開く。→ 無効であることが示される。
4. **メールアドレスの変更と退会（US4）**
   - `/account` でメールアドレスの変更を選ぶ。→ `/account/reauth` に移る。
   - パスワードを入れて再認証し、新しいアドレスを入力する。→ 新しいアドレスに確認メールが出る。確認するまでは古いアドレスのまま使える。
   - リンクを開く。→ 新しいアドレスに変わり、古いアドレスに通知が出る。
   - 退会を選び、再認証して確認する。→ `/account-deleted` が表示され、DB の `user`、`session`、`account`、`consents` に本人の行が残っていない。`auth_events` の本人の行は `user_id` が NULL になっている。
5. **規約の改定と Cookie（US5）**
   - `apps/web/src/legal/registry.ts` の `terms` の現行の版を新しい版に変え、`content/legal/terms/` に本文を足して再起動する。→ ログインすると `/consent` に移り、同意すると `consents` に新しい版の行ができる。
   - シークレットウィンドウで開く。→ Cookie の同意のバナーが出る。「必須のみ」を選ぶと、それ以降は出ない。
6. **ロール、停止、メンテナンス（US6）**
   - 利用者のアカウントで `/operator` を開く。→ 404 になる。
   - `pnpm --filter @app/web ops:grant-operator <email>` を実行してから開く。→ 入れる。
   - DB で `status = 'suspended'` にしてから操作する。→ `/suspended` に移り、再びログインしようとしても拒否される。
   - `MAINTENANCE_MODE=1 pnpm dev` で起動する。→ どのページも `/maintenance`（503）になる。
7. **CI のブランチ保護**
   - GitHub のリポジトリ設定で、`main` のブランチ保護に `ci` の必須チェックを登録する。→ CI が失敗している PR は、マージのボタンが押せない。
8. **Google（US2。手動だけで確かめる）**
   - `/sign-up` で同意のチェックを入れ、「Google で登録」を選ぶ。→ 登録してログインした状態になる。
   - 同意のチェックを入れずに `/sign-in` から、未登録の Google アカウントでログインする。→ `CONSENT_REQUIRED` で `/sign-up` に戻る。
   - シナリオ 1 で作ったメールアドレスと同じアドレスの Google アカウントでログインする。→ 同じアカウントに結びつく（`account` に `google` の行が増える）。
   - Google だけのアカウントで `/account` を開く。→ メールアドレスの変更とパスワードの設定ができないことが示される。

## メール送信の障害（SC-008）

- `MAIL_TRANSPORT=resend` にし、`RESEND_API_KEY` を誤った値にしてサインアップする。→ `outbound_emails.attempts` が増え、5 回目で `failed` になり、`error` のログが出る。
- 正しいキーに戻して「確認メールを送り直す」を選ぶ。→ 届く。
