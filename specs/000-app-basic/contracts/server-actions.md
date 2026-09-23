# 契約: Server Actions と独自エンドポイント

**Feature**: `000-app-basic`

Better Auth の標準のエンドポイントは `/api/auth/*` に置く（`apps/web/src/app/api/auth/[...all]/route.ts`）。画面は、原則として Better Auth のクライアント（`authClient`）を呼ぶ。Better Auth で足りない操作だけを、Server Action または独自のエンドポイントにする。

## Better Auth の標準のエンドポイント（使うもの）

| 操作 | エンドポイント | 追加の振る舞い（hooks） |
|---|---|---|
| サインアップ | `POST /api/auth/sign-up/email` | before: 同意の確認（`pending_consent`）、漏えいパスワードの確認。after: 同意の記録 |
| ログイン | `POST /api/auth/sign-in/email` | before: アカウントごとの試行の制限。after: 認証の記録（成功、失敗） |
| Google | `POST /api/auth/sign-in/social`（`provider: "google"`） | user.create.before: 同意の確認。session.create.before: 停止の確認 |
| ログアウト | `POST /api/auth/sign-out` | — |
| 確認メールの送り直し | `POST /api/auth/send-verification-email` | before: 1 時間に 3 回の制限 |
| 確認 | `GET /api/auth/verify-email?token=` | — |
| 再設定の依頼 | `POST /api/auth/request-password-reset` | before: 試行の制限。Google だけのアカウントなら、Google でのログインの案内メールに差し替える |
| 再設定 | `POST /api/auth/reset-password` | before: 漏えいパスワードの確認。after: 認証の記録、全セッションの失効 |
| メールアドレスの変更 | `POST /api/auth/change-email` | before: パスワードを持つか、再認証が 10 分以内かの確認。確認後: 認証の記録、古いアドレスへの通知 |
| 退会 | `POST /api/auth/delete-user` | before: 再認証が 10 分以内かの確認。直前: 認証の記録（`account_deleted`） |

## 独自のエンドポイント・Server Action

| 名前 | 入力 | 出力 | エラーコード |
|---|---|---|---|
| `POST /api/auth/reauth/password`（Better Auth のプラグインとして追加） | `{ password: string }` | `{ ok: true }`。セッションの `reauthenticated_at` を今にする | `INVALID_PASSWORD`、`NO_PASSWORD`、`TOO_MANY_ATTEMPTS` |
| Server Action `acceptConsent` | `{ documents: ("terms"｜"privacy")[] }` | 現行の版の同意を記録し、`/` へ移す | `CONSENT_OUTDATED`（画面を開いた後に版が変わった） |
| Server Action `startSignUpConsent` | `{ agreed: true }` | `pending_consent` の Cookie（HttpOnly、SameSite=Lax、10 分）を発行する | `CONSENT_REQUIRED` |
| Server Action `setCookieConsent` | `{ optional: boolean }` | Cookie `cookie_consent` を 1 年で発行する | — |

## エラーコード（利用者への表示）

| コード | HTTP | 表示の方針 |
|---|---|---|
| `INVALID_EMAIL_OR_PASSWORD` | 401 | 「メールアドレスまたはパスワードが正しくありません」。存在の有無を示さない |
| `EMAIL_NOT_VERIFIED` | 403 | 確認メールの送り直しへの導線を出す |
| `TOO_MANY_ATTEMPTS` | 429 | 「しばらく待ってからお試しください」 |
| `PASSWORD_COMPROMISED` | 400 | 漏えいが知られているパスワードであることを示す |
| `PASSWORD_TOO_SHORT` | 400 | 8 文字以上を求める |
| `CONSENT_REQUIRED` | 400 | 規約への同意が必要であることを示す |
| `ACCOUNT_SUSPENDED` | 403 | `/suspended` へ移す |
| `REAUTH_REQUIRED` | 403 | `/account/reauth` へ移す |
| `EMAIL_CHANGE_NOT_ALLOWED` | 403 | Google だけのアカウントでは変更できないことを示す |
| `EMAIL_UNAVAILABLE` | 400 | 「このメールアドレスには変更できません」。ほかのアカウントの存在を示さない |
| `TOKEN_INVALID` | 400 | リンクが無効か期限切れであることと、再依頼への導線を示す |
