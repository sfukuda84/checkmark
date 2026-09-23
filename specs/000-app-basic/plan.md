# Implementation Plan: アプリ基盤

**Branch**: `feature/000-app-basic` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/000-app-basic/spec.md`

## Summary

この機能で、個人アカウントの基盤を作る。

- サインアップとログインは、メールアドレスとパスワード（確認つき）と Google の 2 通りにする。
- ほかに、パスワードの再設定、再認証つきのメールアドレスの変更と退会、規約・プライバシーポリシー・Cookie への同意、ロールと停止、メンテナンス表示を作る。
- 品質ゲートの CI も入れる。

作り方の方針は次のとおり。

- 認証は Better Auth を中心にし、標準で足りない部分を hooks と小さな独自処理で補う。対象は、アカウントごとの試行の制限、同意の確認、再認証、漏えいパスワードの確認、認証の記録である。
- メールは pg-boss のジョブで送り、送信先サービスの障害に耐えるようにする。
- リポジトリは pnpm ワークスペースで作る（`apps/web`、`apps/worker`、`packages/*`）。

## Technical Context

**Language/Version**: TypeScript 6.0、Node.js 22 LTS

**Primary Dependencies**:
- Next.js 16.3（App Router）、React 19
- Better Auth 1.7.5、Drizzle ORM 0.45、pg 8、pg-boss 12
- Resend 6、Zod 4、pino

**Storage**: PostgreSQL 17（開発は `compose.dev.yaml`、本番は VPS 上のコンテナ）

**Testing**: Vitest 5（単体テストと、実際の PostgreSQL を使う結合テスト）、Playwright 1.63（E2E）

**Target Platform**: Linux（Docker）上の Node.js。利用者の環境は、Chrome、Edge、Safari、Firefox の最新 2 版（PC とスマートフォン）

**Project Type**: Web アプリケーション（Next.js と、バックグラウンドのワーカー）

**Performance Goals**: 画面と操作の応答が p95 で 1 秒以内（NFR-PE-001、SC-006）、同時利用者 20 人（NFR-PE-003）

**Constraints**:
- VPS 2GB に web、worker、PostgreSQL が同居する（`docs/architecture.md`）。
- 外部サービスは Resend、Google OAuth、Have I Been Pwned の 3 つで、いずれもタイムアウトと障害時の振る舞いを決める（憲章 III）。

**Scale/Scope**: 利用者は MVP で数百人、1 年後に 1,000 人程度。画面は 15 程度

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則・基準 | 確認 | 結果 |
|---|---|---|
| I. 仕様駆動開発 | spec.md（clarify 2 回済み）から plan を作っている。成果物は日本語で書いている | ✅ |
| II. 候補名の機密性 | 退会で、本人の行を 1 トランザクションで削除する（CASCADE。data-model §10）。後続の機能のテーブルにも CASCADE を課す。ログは pino の `redact` で伏せる。認証の記録にメールアドレスを持たない。認可のテスト（運営者の画面、他人のセッション）を書く | ✅ |
| III. 外部サービスの規約と差し替え | Resend は `MailTransport`、HIBP は `PwnedPasswordChecker` のアダプタにする。タイムアウトは Resend 10 秒、HIBP 3 秒とする。メールは再送の上限つきのジョブで送る。HIBP の障害は fail-open にする。Google は Better Auth の標準の OAuth を使う | ✅ |
| IV. 結果を誤認させない | 利用規約の本文に、簡易チェックの免責を入れる（FR-018）。チェックの結果の表示は `001` 以降で扱う | ✅ |
| V. テストファースト | 試行の制限、同意の判定、再認証、Google だけの制限、漏えいの確認、掃除の対象を、テストファーストで作る。主な流れを E2E で確かめる。CI を作る（FR-029） | ✅ |
| VI. シンプルさと費用 | 技術は `docs/architecture.md` のとおりである。追加の依存は pino、Zod、Resend SDK だけで、いずれも無料。月額への影響はない | ✅ |
| NFR-SE-001〜008 | パスワードの基準（SE-005）、試行の制限（SE-006）、ログの伏せ字（SE-004）、秘密情報を `.env` に置く（SE-003）、認可のテスト（SE-007）を満たす。TLS とサーバーの設定（SE-001、SE-008）は `999` の範囲 | ✅ |
| NFR-PE-001、NFR-PE-003 | 認証の処理は DB への単純な問い合わせだけである。E2E で応答を計測する | ✅ |
| NFR-DA-004 | 退会の即時削除を、結合テストで確かめる | ✅ |
| NFR-OP-005 | CI で lint、typecheck、test、e2e を実行する | ✅ |
| NFR-AV-003 | `MAINTENANCE_MODE` でメンテナンス表示を出す | ✅ |
| NFR-UX-001〜003 | フォームにラベルを付け、キーボードで操作できるようにする。Playwright の axe の検査を E2E に入れる | ✅ |
| NFR-CO-001 | プライバシーポリシーの原案に、利用目的と外部サービス（Resend、Google、HIBP には SHA-1 の先頭 5 文字だけを送る）を書く | ✅ |

**Phase 1 の後の再確認**: data-model と contracts でも違反はない。ただし、Better Auth の `updateAge` の都合で、ログイン状態の延長は 1 日単位になり、FR-008a との誤差が最大 1 日ある（research R3）。仕様の意図（30 日使わなければログアウト）は満たすので、違反とはしない。

## Project Structure

### Documentation (this feature)

```text
specs/000-app-basic/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── routes.md
│   ├── server-actions.md
│   └── jobs-and-cli.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
package.json                 # ワークスペースのルート（scripts: dev, build, lint, typecheck, test, test:e2e, db:migrate）
pnpm-workspace.yaml
tsconfig.base.json
eslint.config.mjs
.prettierrc
.env.example
compose.dev.yaml             # 開発用 PostgreSQL
.github/workflows/ci.yml     # FR-029

apps/web/                    # @app/web
├── next.config.ts           # output: "standalone"
├── src/
│   ├── proxy.ts             # メンテナンス表示（FR-028）
│   ├── app/
│   │   ├── api/auth/[...all]/route.ts
│   │   ├── (auth)/sign-up/、sign-in/、verify-email/、forgot-password/、reset-password/
│   │   ├── (app)/page.tsx、account/、account/reauth/、consent/
│   │   ├── operator/page.tsx
│   │   ├── suspended/、maintenance/、account/deleted/
│   │   └── legal/terms/、privacy/、cookies/
│   ├── auth/
│   │   ├── auth.ts          # Better Auth の設定
│   │   ├── auth-client.ts
│   │   ├── hooks.ts         # before / after / databaseHooks
│   │   ├── reauth-plugin.ts # /reauth/password
│   │   ├── guards.ts        # requireUser, requireOperator
│   │   ├── rate-limit.ts    # アカウントごとの制限
│   │   ├── account-policy.ts# Google だけのアカウントの制限
│   │   └── pwned.ts         # PwnedPasswordChecker
│   ├── legal/registry.ts、consent.ts
│   ├── events/auth-events.ts
│   ├── jobs/client.ts       # pg-boss（送信のみ）
│   └── components/          # フォーム、Cookie のバナー
├── content/legal/terms/2026-09-23.md、privacy/2026-09-23.md
├── scripts/grant-operator.ts
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/

apps/worker/                 # @app/worker
├── src/index.ts             # pg-boss の起動とスケジュール
├── src/jobs/send-email.ts、cleanup-unverified-users.ts、prune.ts
└── tests/

packages/db/                 # @app/db
├── src/schema/auth.ts、consents.ts、auth-events.ts、outbound-emails.ts、rate-limit-buckets.ts
├── src/client.ts
├── drizzle.config.ts
└── migrations/

packages/mail/               # @app/mail
├── src/transport.ts、resend.ts、file.ts
└── src/templates/           # 確認、再設定、変更の確認と通知、Google だけの案内

packages/shared/             # @app/shared
└── src/logger.ts、env.ts、time.ts
```

**Structure Decision**: pnpm ワークスペースで、`apps/web`（Next.js）と `apps/worker`（pg-boss）の 2 つの実行単位と、共有の `packages/db`、`packages/mail`、`packages/shared` に分ける。`001` で `apps/importer` を足す（research R2）。

## Complexity Tracking

憲章の違反はない。
