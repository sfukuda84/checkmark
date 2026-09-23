# 契約: ジョブと CLI

**Feature**: `000-app-basic`

## pg-boss のキュー（`apps/worker`）

| キュー | 起動 | データ | 振る舞い |
|---|---|---|---|
| `send-email` | web が登録する | `{ outboundEmailId: string, kind: string, to: string, url?: string }` | `MailTransport` で送る。成功したら `outbound_emails.status = sent`。失敗したら例外を投げ、pg-boss が再送する（`retryLimit: 5`、`retryDelay: 30`、`retryBackoff: true`）。最後の失敗で `failed` にして、`error` のログを出す。完了したジョブは 1 日で削除する |
| `cleanup-unverified-users` | 毎日 03:00 JST | なし | 未確認かつ登録から 7 日を過ぎ、`google` のログイン手段を持たない user を削除する |
| `prune-auth-events` | 毎日 03:10 JST | なし | `occurred_at` が 90 日より前の行を削除する |
| `prune-outbound-emails` | 毎日 03:20 JST | なし | `created_at` が 30 日より前の行を削除する |
| `prune-rate-limit-buckets` | 毎時 | なし | `expires_at` を過ぎた行を削除する |

- ジョブのデータ（宛先、リンク）はログに出さない。

## MailTransport（`packages/mail`）

```ts
interface MailMessage { to: string; subject: string; text: string; html: string; }
interface MailTransport { send(message: MailMessage): Promise<{ id: string }>; }
```

- `ResendTransport`（本番）: タイムアウトは 10 秒。Resend のエラーは例外にする。
- `FileTransport`（開発とテスト）: `MAIL_OUTBOX_DIR` に `<timestamp>-<to>.json` を書く。
- 選択: 環境変数 `MAIL_TRANSPORT=resend|file`。

## PwnedPasswordChecker（`apps/web`）

```ts
interface PwnedPasswordChecker { isCompromised(password: string): Promise<boolean | "unknown">; }
```

- SHA-1 の先頭 5 文字だけを `https://api.pwnedpasswords.com/range/<prefix>` に送る。タイムアウトは 3 秒。
- 失敗したら `"unknown"` を返す。呼び出し側は受け付けて、警告のログを出す（fail-open）。

## CLI

| コマンド | 内容 |
|---|---|
| `pnpm --filter @app/web ops:grant-operator <email>` | 指定したアカウントのロールを `operator` にする（FR-027） |
| `pnpm --filter @app/web ops:revoke-operator <email>` | ロールを `user` に戻す |
| `pnpm db:migrate` | マイグレーションを適用する |

## 環境変数

| 名前 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続先 |
| `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` | Better Auth の秘密と公開 URL |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google の OAuth |
| `MAIL_TRANSPORT`、`RESEND_API_KEY`、`MAIL_FROM`、`MAIL_OUTBOX_DIR` | メール |
| `MAINTENANCE_MODE` | `1` でメンテナンス表示 |
| `TRUSTED_PROXY_IPS` | 接続元の判定で信頼するプロキシ（Caddy） |
| `SUPPORT_CONTACT` | 停止の画面などに出す問い合わせ先 |
