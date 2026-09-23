---

description: "アプリ基盤（000-app-basic）の実装タスク"
---

# Tasks: アプリ基盤

**Input**: `/specs/000-app-basic/` の設計文書

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 憲章 V（ドメインのロジックはテストファースト）により、テストのタスクを含める。各ストーリーでは、テストを先に書き、失敗することを確かめてから実装する。

**Organization**: ユーザーストーリーごとにタスクをまとめ、ストーリーごとに実装とテストができるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行して進められる（別のファイルで、未完了のタスクに依存しない）
- **[Story]**: 対象のユーザーストーリー（US1〜US6）
- パスは plan.md の「Source Code」に従う（pnpm ワークスペース: `apps/web`、`apps/worker`、`packages/*`）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: ワークスペース、ツール、CI の初期化

- [ ] T001 ワークスペースのルートを作る。`package.json`（scripts: `dev`、`build`、`lint`、`typecheck`、`test`、`test:e2e`、`db:migrate`、`format`）、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.tool-versions`（nodejs 22、pnpm 11）、`.gitignore` への `.mail-outbox/`、`.next/`、`test-results/`、`playwright-report/` の追記
- [ ] T002 [P] ESLint（typescript-eslint、eslint-config-next）と Prettier を設定する。`eslint.config.mjs`、`.prettierrc`、`.prettierignore`
- [ ] T003 [P] 開発用の PostgreSQL 17 を `compose.dev.yaml` に定義し、`.env.example` に contracts/jobs-and-cli.md の環境変数をすべて載せる
- [ ] T004 [P] `packages/shared` を作る。`src/env.ts`（Zod による環境変数の検証）、`src/time.ts`（現在時刻の注入）、`src/logger.ts`（pino。`password`、`token`、`session`、`cookie`、`authorization`、`email`、`candidate` を redact する）。先に `packages/shared/tests/logger.test.ts` で伏せ字のテストを書く（FR-030、NFR-SE-004）
- [ ] T005 `apps/web` に Next.js 16（App Router、`output: "standalone"`）を作る。`next.config.ts`、`src/app/layout.tsx`（`lang="ja"`）、`src/app/globals.css`
- [ ] T006 [P] `apps/worker` を作る（`src/index.ts` で pg-boss を起動し、キューを登録する骨組み）
- [ ] T007 [P] テストの設定を作る。ルートの `vitest.workspace.ts`、`apps/web/vitest.config.ts`（unit と integration を分ける）、`apps/web/playwright.config.ts`（web と worker を起動し、`MAIL_TRANSPORT=file` にする）
- [ ] T008 CI を作る。`.github/workflows/ci.yml` で、PostgreSQL のサービスを起動し、`pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm db:migrate`、`pnpm test`、`pnpm test:e2e` を実行する。ジョブ名は `ci` とする（FR-029）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: すべてのストーリーの前提になる DB、メール、Better Auth の骨組み

**⚠️ CRITICAL**: このフェーズが終わるまで、ストーリーの作業は始めない

- [ ] T009 `packages/db/src/schema/auth.ts` に、`user`（`role`、`status` の CHECK を含む）、`session`（`reauthenticated_at` を含む）、`account`、`verification`、`rate_limit` を data-model.md §1〜5 のとおり定義する
- [ ] T010 [P] `packages/db/src/schema/` に、`consents.ts`、`auth-events.ts`、`outbound-emails.ts`、`rate-limit-buckets.ts` を data-model.md §6〜9 のとおり定義する。FK の ON DELETE（CASCADE と SET NULL）を data-model.md §10 に合わせる
- [ ] T011 `packages/db/drizzle.config.ts`、`packages/db/src/client.ts`、最初のマイグレーション（`packages/db/migrations/`）を作り、ルートの `pnpm db:migrate` から適用できるようにする
- [ ] T012 結合テストの補助を作る。`apps/web/tests/helpers/db.ts`（テスト用 DB へのマイグレーションと、テストごとの全テーブルの初期化）、`apps/web/tests/helpers/mail.ts`（`.mail-outbox/` からリンクを読む）
- [ ] T013 [P] `packages/mail` の送信手段を作る。先に `packages/mail/tests/transport.test.ts`（FileTransport の出力、ResendTransport のタイムアウトとエラーの例外化。HTTP はモック）を書き、`src/transport.ts`、`src/file.ts`、`src/resend.ts`、`src/index.ts`（`MAIL_TRANSPORT` による選択）を実装する
- [ ] T014 [P] `packages/mail/src/templates/` に、`verify_email`、`reset_password`、`reset_password_google_only`、`change_email_verify`、`change_email_notice` の文面（件名、テキスト、HTML、日本語）を作る
- [ ] T015 `apps/web/src/jobs/client.ts` に、`enqueueEmail(kind, to, url?, userId?)` を作る。`outbound_emails` に `pending` の行を作り、pg-boss の `send-email` に `retryLimit: 5`、`retryDelay: 30`、`retryBackoff: true` で登録する（research R8）
- [ ] T016 `apps/worker/src/jobs/send-email.ts` を作る。先に `apps/worker/tests/send-email.test.ts`（成功で `sent`、失敗で例外と `attempts` の加算、最後の失敗で `failed` と error のログ。宛先とリンクをログに出さない）を書いてから実装する（FR-022、FR-023）
- [ ] T017 `apps/web/src/auth/auth.ts` に、Better Auth の基本の設定を書く。対象は、Drizzle アダプタ、`emailAndPassword`（`requireEmailVerification`、`minPasswordLength: 8`、`resetPasswordTokenExpiresIn: 3600`、`revokeSessionsOnPasswordReset`）、`emailVerification`（`expiresIn: 86400`、`autoSignInAfterVerification`、送信は `enqueueEmail`）、`session`（`expiresIn: 30 日`、`updateAge: 1 日`、`reauthenticatedAt` の追加フィールド）、`user.additionalFields`（`role`、`status`、入力不可）、`rateLimit`（`storage: "database"`、`customRules`）、`advanced.ipAddress`（`TRUSTED_PROXY_IPS`）である。あわせて、`apps/web/src/app/api/auth/[...all]/route.ts` と `apps/web/src/auth/auth-client.ts` を作る（research R3、R4）
- [ ] T018 `apps/web/src/auth/guards.ts` に、`requireUser()` と `requireOperator()` の骨組みを作る。未ログインなら `/sign-in` へ、未確認なら `/verify-email` へ移す。停止と同意の判定は US5、US6 で足す。先に `apps/web/tests/unit/guards.test.ts` で、判定の関数（セッションの状態から行き先を返す純粋関数）のテストを書く
- [ ] T019 [P] `apps/web/src/events/auth-events.ts` に、`recordAuthEvent(type, { userId?, ip, userAgent })` を作る。先に `apps/web/tests/unit/auth-events.test.ts`（メールアドレスを受け取らないこと、type の検証）を書く（FR-031）
- [ ] T020 [P] 共通の UI を作る。`apps/web/src/components/`（フォーム、入力、ボタン、エラーの表示）と、`apps/web/src/lib/error-messages.ts`（contracts/server-actions.md のエラーコードから表示文言への対応）

**Checkpoint**: 基盤がそろい、ストーリーの実装を始められる

---

## Phase 3: User Story 1 - メールアドレスとパスワードで登録してログインする (Priority: P1) 🎯 MVP

**Goal**: メールアドレスとパスワードでサインアップ（同意つき）、確認、ログイン、ログアウトができる

**Independent Test**: quickstart.md のシナリオ 1、2 と、E2E `apps/web/tests/e2e/us1-email-auth.spec.ts`

### Tests for User Story 1 ⚠️

> **先にテストを書き、失敗することを確かめてから実装する**

- [ ] T021 [P] [US1] `apps/web/tests/unit/rate-limit.test.ts`: アカウントごとの制限。キーがメールアドレスの SHA-256 であること、15 分に 10 回の境界、確認メールの送り直しの 1 時間に 3 回の境界、窓の終了後に数え直すこと（FR-004、FR-008）
- [ ] T022 [P] [US1] `apps/web/tests/unit/pwned.test.ts`: 漏えいの確認。先頭 5 文字だけを送ること、一致の判定、3 秒のタイムアウトと HTTP の失敗で `"unknown"` を返すこと（FR-002）
- [ ] T023 [P] [US1] `apps/web/tests/unit/consent.test.ts`: 現行の版への同意がそろっているかの判定、`pending_consent` の値の検証（FR-017、FR-019）
- [ ] T024 [US1] `apps/web/tests/integration/email-auth.test.ts`: 同意なしのサインアップの拒否、漏えいパスワードと 8 文字未満の拒否、確認メールの登録、確認前のログインの拒否、確認後のログイン、存在を示さない失敗、11 回目の `TOO_MANY_ATTEMPTS`、ログアウト、二重のサインアップで存在が分からないこと（FR-001〜FR-004、FR-006〜FR-008、FR-017）

### Implementation for User Story 1

- [ ] T025 [US1] `apps/web/src/auth/rate-limit.ts` を実装し、`apps/web/src/auth/hooks.ts` の `hooks.before` で、`/sign-in/email`、`/request-password-reset`、`/send-verification-email` に適用する
- [ ] T026 [US1] `apps/web/src/auth/pwned.ts`（`PwnedPasswordChecker`）を実装し、`hooks.before` でサインアップ、パスワードの再設定、パスワードの変更に適用する。`"unknown"` のときは受け付けて、警告のログを出す
- [ ] T027 [P] [US1] 規約を作る。`apps/web/src/legal/registry.ts`（現行の版）、`apps/web/content/legal/terms/2026-09-23.md`（簡易チェックであり法的判断ではない旨の免責を含む。FR-018）、`apps/web/content/legal/privacy/2026-09-23.md`（利用目的、Resend・Google・HIBP への送信、保存期間、国外にバックアップを置く可能性。NFR-CO-001、NFR-CO-002）、`apps/web/src/app/legal/terms/page.tsx`、`apps/web/src/app/legal/privacy/page.tsx`
- [ ] T028 [US1] `apps/web/src/legal/consent.ts` と、Server Action `startSignUpConsent`（`apps/web/src/app/(auth)/sign-up/actions.ts`）を実装する。`databaseHooks.user.create.before` で `pending_consent` を確かめて `CONSENT_REQUIRED` で拒否し、`user.create.after` で `consents` に記録する（research R7）
- [ ] T029 [US1] `apps/web/src/app/(auth)/sign-up/page.tsx` を作る。メールアドレス、パスワード、同意のチェック、規約へのリンク
- [ ] T030 [US1] `apps/web/src/app/(auth)/verify-email/page.tsx`（案内と送り直し）と、`apps/web/src/app/(auth)/verify-email/callback/page.tsx`（成功と失敗の表示）を作る
- [ ] T031 [US1] `apps/web/src/app/(auth)/sign-in/page.tsx`、ログアウトのボタン（`apps/web/src/components/sign-out-button.tsx`）、ログイン後の `apps/web/src/app/(app)/page.tsx`（`requireUser()` を通す）を作る
- [ ] T032 [US1] `hooks.after` で、ログインの成功と失敗を `recordAuthEvent` で記録する。存在しないアドレスでは `userId` を NULL にする（FR-031）
- [ ] T033 [US1] `apps/web/tests/e2e/us1-email-auth.spec.ts`: サインアップ、確認メールのリンク、ログイン、ログアウト、再ログイン

**Checkpoint**: US1 だけで、メールアドレスとパスワードの利用者が使い始められる

---

## Phase 4: User Story 2 - Google アカウントで登録・ログインする (Priority: P1)

**Goal**: Google で登録（同意つき）とログインができ、同じアドレスの既存のアカウントに結びつく

**Independent Test**: quickstart.md のシナリオ 8（手動）と、結合テスト `apps/web/tests/integration/google-auth.test.ts`

### Tests for User Story 2 ⚠️

- [ ] T034 [P] [US2] `apps/web/tests/integration/google-auth.test.ts`: Google のトークンの交換とプロフィールの取得をモックし、次を確かめる。同意の Cookie ありで新規作成されること、なしで `CONSENT_REQUIRED` になること、Google 側で確認済みの同じアドレスなら既存の user に `google` の account が足されること、確認されていなければ結びつかないこと、キャンセルでアカウントが作られないこと（FR-005、FR-005a、FR-017）

### Implementation for User Story 2

- [ ] T035 [US2] `apps/web/src/auth/auth.ts` に `socialProviders.google` と `account.accountLinking`（`enabled: true`、`allowDifferentEmails: false`、`trustedProviders` は空）を足す。`/sign-up` と `/sign-in` に「Google で登録／ログイン」のボタンを足す。`CONSENT_REQUIRED` で戻ったときは、`/sign-up` で同意を求める表示を出す

**Checkpoint**: US1 と US2 で、どちらの手段でも使い始められる

---

## Phase 5: User Story 3 - パスワードを忘れたときに再設定する (Priority: P2)

**Goal**: メールのリンクで、パスワードを安全に再設定できる

**Independent Test**: quickstart.md のシナリオ 3 と、E2E `apps/web/tests/e2e/us3-password-reset.spec.ts`

### Tests for User Story 3 ⚠️

- [ ] T036 [P] [US3] `apps/web/tests/integration/password-reset.test.ts`: 登録の有無によらず同じ応答であること、Google だけのアカウントには `reset_password_google_only` のメールになること、リンクの期限が 1 時間であること、2 回目の使用が `TOKEN_INVALID` になること、再設定で全セッションが失効すること、漏えいパスワードの拒否、試行の制限、認証の記録（`password_reset`）（FR-009〜FR-011）

### Implementation for User Story 3

- [ ] T037 [US3] `sendResetPassword` を `enqueueEmail` につなぐ。`hooks.before` の `/request-password-reset` で、Google だけのアカウントなら案内のメールに差し替える（`apps/web/src/auth/account-policy.ts` の `hasPassword()` を使う）
- [ ] T038 [US3] `apps/web/src/app/(auth)/forgot-password/page.tsx` と `apps/web/src/app/(auth)/reset-password/page.tsx` を作る。`hooks.after` で `password_reset` を記録する
- [ ] T039 [US3] `apps/web/tests/e2e/us3-password-reset.spec.ts`: 再設定の依頼、リンク、新しいパスワードでのログイン、古いパスワードの拒否、リンクの再使用の拒否

**Checkpoint**: パスワードを忘れても復帰できる

---

## Phase 6: User Story 4 - メールアドレスを変更する・退会する (Priority: P2)

**Goal**: 再認証を経て、メールアドレスの変更と退会（全データの削除）ができる

**Independent Test**: quickstart.md のシナリオ 4 と、E2E `apps/web/tests/e2e/us4-account.spec.ts`

### Tests for User Story 4 ⚠️

- [ ] T040 [P] [US4] `apps/web/tests/unit/account-policy.test.ts`: `hasPassword()`、Google だけのアカウントでメール変更とパスワード設定を拒否する判定、再認証の新しさ（10 分）の判定（FR-012a、Clarifications Round 1）
- [ ] T041 [P] [US4] `apps/web/tests/integration/account.test.ts`: 次を確かめる。
  - 再認証なしの変更と退会が `REAUTH_REQUIRED` になること
  - 使われているアドレスへの変更が `EMAIL_UNAVAILABLE` になり、存在が分からないこと
  - 確認の前は古いアドレスのままであること、確認後に古いアドレスへ通知が出ること
  - Google だけのアカウントの変更が `EMAIL_CHANGE_NOT_ALLOWED` になること
  - 退会で `user`、`session`、`account`、`consents`、`outbound_emails`、`verification` の本人の行がなくなり、`auth_events` の `user_id` が NULL になること
  - 退会の途中の失敗で、データが一部だけ消えないこと（トランザクション）
  - 対象の要件: FR-012〜FR-016、FR-032

### Implementation for User Story 4

- [ ] T042 [US4] `apps/web/src/auth/reauth-plugin.ts` に、`POST /api/auth/reauth/password` を作る（パスワードの照合、`reauthenticatedAt` の更新、試行の制限）。Google だけの利用者は、`signIn.social({ provider: "google", prompt: "login" })` から戻ったときに `reauthenticatedAt` を更新する（research R6）
- [ ] T043 [US4] `user.changeEmail` を設定する。確認メールは `change_email_verify` で送る。`hooks.before` の `/change-email` で、`hasPassword()` と再認証を確かめ、使われているアドレスは `EMAIL_UNAVAILABLE` にする。変更の確認後に、古いアドレスへ `change_email_notice` を送り、`email_changed` を記録する
- [ ] T044 [US4] `user.deleteUser` を設定する。`beforeDelete` で、再認証の確認、`account_deleted` の記録、本人の `verification` の削除を、user の削除と同じトランザクションで行う（data-model §10）
- [ ] T045 [US4] `apps/web/src/app/(app)/account/page.tsx`、`apps/web/src/app/(app)/account/reauth/page.tsx`、`apps/web/src/app/account/deleted/page.tsx` を作る。Google だけのアカウントには、変更できない理由を表示する
- [ ] T046 [US4] `apps/web/tests/e2e/us4-account.spec.ts`: 再認証、メールアドレスの変更と確認、退会と退会後のログインの拒否

**Checkpoint**: 本人が自分のデータを確実に消せる（憲章 II）

---

## Phase 7: User Story 5 - 規約の改定と Cookie に同意する (Priority: P3)

**Goal**: 規約の改定時の再同意と、Cookie の同意ができる

**Independent Test**: quickstart.md のシナリオ 5 と、E2E `apps/web/tests/e2e/us5-consent.spec.ts`

### Tests for User Story 5 ⚠️

- [ ] T047 [P] [US5] `apps/web/tests/integration/consent-gate.test.ts`: 旧版だけに同意した利用者が `/consent` へ移されること、`acceptConsent` で現行の版が記録されること、画面を開いた後に版が変わると `CONSENT_OUTDATED` になること（FR-019、FR-020）

### Implementation for User Story 5

- [ ] T048 [US5] `requireUser()` に同意の判定を足す。`apps/web/src/app/(app)/consent/page.tsx` と、Server Action `acceptConsent`（`apps/web/src/app/(app)/consent/actions.ts`）を作る。同意しない場合は、ログアウトだけができる
- [ ] T049 [P] [US5] Cookie の同意を作る。`apps/web/src/components/cookie-banner.tsx`、Server Action `setCookieConsent`、`apps/web/src/app/legal/cookies/page.tsx`（選択の変更）。必須でない Cookie は、同意があるまで発行しない（FR-021）
- [ ] T050 [US5] `apps/web/tests/e2e/us5-consent.spec.ts`: 旧版の同意の行を DB に入れた利用者でログインすると `/consent` に移ること、同意で `/` に進めること、初回訪問のバナーと「必須のみ」の選択

**Checkpoint**: 規約の改定に追随できる

---

## Phase 8: User Story 6 - 運営者と利用者を区別し、停止とメンテナンスを反映する (Priority: P3)

**Goal**: ロールによる運営者の画面の制限、停止の反映、メンテナンス表示

**Independent Test**: quickstart.md のシナリオ 6 と、E2E `apps/web/tests/e2e/us6-roles.spec.ts`

### Tests for User Story 6 ⚠️

- [ ] T051 [P] [US6] `apps/web/tests/integration/roles-and-suspension.test.ts`: 次を確かめる。
  - 停止中のアカウントのログインが `ACCOUNT_SUSPENDED` になり、`sign_in_rejected_suspended` が記録されること
  - ログイン中に停止されると、次の `requireUser()` でセッションが失効すること
  - 利用者が `requireOperator()` で 404 になり、運営者は通ること
  - CLI による付与と取り消し
  - 対象の要件: FR-024〜FR-027
- [ ] T052 [P] [US6] `apps/web/tests/unit/proxy.test.ts`: `MAINTENANCE_MODE=1` のときに、`/maintenance` と静的ファイル以外が書き換えられ、503 になること（FR-028）

### Implementation for User Story 6

- [ ] T053 [US6] `databaseHooks.session.create.before` で停止中なら拒否する。`requireUser()` に停止の判定（セッションの失効と `/suspended` への移動）を足す。`apps/web/src/app/suspended/page.tsx` を作り、問い合わせ先に `SUPPORT_CONTACT` を表示する
- [ ] T054 [US6] `requireOperator()` を実装し、`apps/web/src/app/operator/page.tsx`（入口だけ）を作る
- [ ] T055 [P] [US6] `apps/web/scripts/grant-operator.ts`（`ops:grant-operator` と `ops:revoke-operator`）を作り、`apps/web/package.json` の scripts に登録する
- [ ] T056 [US6] `apps/web/src/proxy.ts` と `apps/web/src/app/maintenance/page.tsx` を作る
- [ ] T057 [US6] `apps/web/tests/e2e/us6-roles.spec.ts`: 利用者が `/operator` で 404 になること、運営者は入れること、停止したアカウントが `/suspended` に移ること

**Checkpoint**: すべてのストーリーが動く

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 定期の掃除、アクセシビリティ、性能、文書

- [ ] T058 [P] 定期のジョブを作る。先に `apps/worker/tests/cleanup.test.ts`（7 日を過ぎた未確認で Google の手段がないものだけを削除すること、90 日・30 日・期限切れの境界）を書き、`apps/worker/src/jobs/cleanup-unverified-users.ts`、`apps/worker/src/jobs/prune.ts` を実装して、`apps/worker/src/index.ts` の pg-boss のスケジュールに登録する（FR-003a、FR-031、research R12）
- [ ] T059 [P] E2E にアクセシビリティの検査（`@axe-core/playwright`）を足す。対象は、`/sign-up`、`/sign-in`、`/account`、`/consent`（NFR-UX-003）
- [ ] T060 [P] E2E で、`/sign-in`、`/sign-up`、`/account` の操作の応答時間を計測し、1 秒を超えたら失敗にする（SC-006、NFR-PE-001）
- [ ] T061 [P] `README.md` に開発の手順（セットアップ、テスト、運営者の付与）を書き、`docs/ops/operator.md` に運営者のロールの付与と、運営者が 0 人になった場合の手順を書く（FR-027、Edge Cases）
- [ ] T062 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` をすべて通し、quickstart.md のシナリオ 1〜6 を確かめる

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**: 依存なし
- **Foundational（Phase 2）**: Setup の後。すべてのストーリーの前提になる
- **US1（Phase 3）**: Foundational の後。ほかのストーリーの前提になる（同意、試行の制限、ログイン）
- **US2（Phase 4）**: US1 の後（同意の Cookie とログインの画面を使う）
- **US3（Phase 5）**: US1 の後。US2 と並行できる（`account-policy.ts` の `hasPassword()` は T037 で作り、T040 で検証する）
- **US4（Phase 6）**: US1 の後。Google の再認証を確かめるには US2 が要る
- **US5（Phase 7）**: US1 の後
- **US6（Phase 8）**: US1 の後
- **Polish（Phase 9）**: すべてのストーリーの後

### Within Each User Story

- テスト → 実装の順。テストが失敗することを確かめてから実装する
- 設定と hooks → 画面 → E2E の順

### Parallel Opportunities

- Phase 1 の T002、T003、T004、T006、T007
- Phase 2 の T010、T013、T014、T019、T020
- 各ストーリーの `[P]` のテスト
- US1 の後は、US3、US5、US6 を並行できる

---

## Parallel Example: User Story 1

```bash
# テストを並行して書く
Task: "T021 apps/web/tests/unit/rate-limit.test.ts"
Task: "T022 apps/web/tests/unit/pwned.test.ts"
Task: "T023 apps/web/tests/unit/consent.test.ts"

# 規約の文書は、実装と並行できる
Task: "T027 apps/web/content/legal/ と legal/registry.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 と Phase 2 を終える
2. Phase 3（US1）を終える
3. quickstart.md のシナリオ 1、2 で確かめる

### Incremental Delivery

1. 基盤 → US1（メールで使い始められる）
2. US2（Google）→ US3（再設定）→ US4（変更と退会）
3. US5（再同意と Cookie）→ US6（ロール、停止、メンテナンス）
4. Polish

---

## Notes

- `[P]` は、別のファイルで依存がないタスクである
- 各タスクまたは区切りのよいところでコミットしてよい。完了の記録は `speckit-worktree` の checkpoint で行う
- 要件とタスクの対応
  - FR-001〜FR-004、FR-006〜FR-008: T021〜T026、T029〜T031
  - FR-003a: T058
  - FR-005、FR-005a: T034、T035
  - FR-008a: T017
  - FR-009〜FR-011: T036〜T038
  - FR-012〜FR-016、FR-012a: T040〜T045
  - FR-017、FR-018: T023、T027〜T029
  - FR-019〜FR-021: T047〜T049
  - FR-022、FR-023: T013〜T016
  - FR-024〜FR-027: T009、T051、T053〜T055
  - FR-028: T052、T056
  - FR-029: T008
  - FR-030: T004
  - FR-031: T019、T032、T058
  - FR-032: T041、T044
  - SC-006: T060
  - SC-008: T016
