# hoge（ネーミングチェッカー）

このプロジェクトは [my-speckit-scaffold](https://github.com/sfukuda84/my-speckit-scaffold)（main、8e8badb）から作成した。
Spec Kit による仕様駆動開発の進め方は [docs/speckit-scaffold.md](docs/speckit-scaffold.md) を参照する。

## 立ち上げ

エージェントで `speckit-bootstrap` スキルを実行し、コアコンセプトから機能一覧、アーキテクチャ、憲章、共通基盤、非機能要件までを作る。その後は `speckit-all` で 1 件ずつ仕様化と実装を進める。

## 概要

名前の候補を、商標・Google 検索・ドメイン・SNS でまとめて確かめる Web サービス。

- 仕様: `specs/`（機能ごと）、`docs/feature/`（機能の一覧と着手順）
- 構成と技術: `docs/architecture.md`、非機能要件: `docs/nfr.md`、憲章: `.specify/memory/constitution.md`
- 開発の進め方（エージェント向け）: `.kiro/steering/`、scaffold の説明: `docs/speckit-scaffold.md`

## 必要なもの

- Node.js 24（`.tool-versions`）、pnpm 11
- Docker（開発用の PostgreSQL）

## セットアップ

```bash
pnpm install
cp .env.example .env
docker compose -f compose.dev.yaml -p naming-checker up -d   # PostgreSQL（既定は 55433 番）
pnpm db:migrate                                              # 開発用 DB
DATABASE_URL=postgres://app:app@localhost:55433/app_test pnpm db:migrate   # テスト用 DB
pnpm --filter @app/importer seed-fixture                     # 検証用の商標データ（照合に使う）
pnpm dev                                                     # web（:3000）と worker
```

開発では `MAIL_TRANSPORT=file` で、メールは `.mail-outbox/` に JSON で書き出される。

商標の照合は、取り込んだ商標データを使う。開発では検証用データ（`apps/importer/fixtures/sample-trademarks.tsv`）を `seed-fixture` で取り込む（`.env` の `DATABASE_URL` を使う）。E2E テストは、テスト用 DB に自動で取り込む。本番の取り込み手順は `docs/ops/trademark-import.md` にある。

## テスト

```bash
pnpm lint          # ESLint
pnpm format:check  # Prettier
pnpm typecheck     # TypeScript
pnpm test          # 単体テストと結合テスト（テスト用 DB を使う）
pnpm test:e2e      # Playwright（初回は pnpm --filter @app/web exec playwright install chromium）
```

## 構成

| パス | 内容 |
|---|---|
| `apps/web` | Next.js（画面、Server Actions、Better Auth） |
| `apps/worker` | pg-boss のジョブ（メールの送信、商標の照合、定期の掃除） |
| `apps/importer` | 商標データの取り込み CLI |
| `packages/db` | Drizzle のスキーマとマイグレーション |
| `packages/mail` | メールの文面と送信手段（Resend / ファイル） |
| `packages/shared` | ログ、環境変数、時刻、キューの定義 |
| `packages/trademark` | 商標の照合のロジック（正規化、読み、称呼の類似、区分） |

## 運用

- 運営者のロールの付与、メンテナンス表示: `docs/ops/operator.md`
- CI とブランチ保護: `docs/ops/ci.md`
- 商標データの取り込み: `docs/ops/trademark-import.md`
