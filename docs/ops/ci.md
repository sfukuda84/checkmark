# CI とブランチ保護

`.github/workflows/ci.yml` のジョブ `ci` が、すべての PR と `main` への push で次を実行する（FR-029、NFR-OP-005、憲章 V）。

1. `pnpm lint`（ESLint）
2. `pnpm format:check`（Prettier）
3. `pnpm typecheck`（TypeScript）
4. `pnpm db:migrate`（テスト用 DB へのマイグレーション）
5. `pnpm test`（単体テストと結合テスト。PostgreSQL のサービスを使う）
6. `pnpm test:e2e`（Playwright。web を standalone で起動し、worker も起動する）

## ブランチ保護の設定（手動、1 回だけ）

CI が失敗している PR を `main` に取り込めないようにするため、GitHub で次を設定する。

1. リポジトリの **Settings → Branches → Add branch ruleset**（または Branch protection rules）を開く。
2. 対象を `main` にする。
3. **Require status checks to pass** を有効にし、必須のチェックに `ci` を追加する。
4. **Require a pull request before merging** を有効にする。

GitHub CLI で設定する場合の例:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=ci" \
  -F "enforce_admins=true" \
  -F "required_pull_request_reviews=null" \
  -F "restrictions=null"
```

## 手元で同じ確認をする

```bash
docker compose -f compose.dev.yaml -p naming-checker up -d
TEST_DATABASE_URL=postgres://app:app@localhost:55433/app_test DATABASE_URL=postgres://app:app@localhost:55433/app_test pnpm db:migrate
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e
```
