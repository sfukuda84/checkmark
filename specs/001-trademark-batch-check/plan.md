# Implementation Plan: 候補名の一括チェックと商標照合

**Branch**: `feature/001-trademark-batch-check` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-trademark-batch-check/spec.md`

## Summary

この機能で、一括チェックの実体（チェック、候補）と比較表を作り、最初の列として商標の照合を載せる。

- 利用者は候補を最大 10 件まとめて入れ、区分を任意で選んで実行する。候補ごとのジョブを worker が処理し、比較表は終わった候補から埋まる。
- 商標は、自前の DB に取り込んだ商標データで照合する。同一は正規化した文字の一致、類似は称呼キーの trigram で抽出してからモーラの重み付き編集距離で順位づけする。
- 利用回数は暦月 50 候補を上限とし、失敗した候補の分は戻す。

作り方の方針は次のとおり。

- 照合のロジック（正規化、読み、類似の度合い、分類）は、DB に依存しない純粋な関数として `packages/trademark` に置き、テストファーストで作る（憲章 V）。
- 商標データへの問い合わせは `TrademarkSource` のアダプタに閉じる（憲章 III）。取り込みは新しい実行単位 `apps/importer` で行う。
- 比較表は列の定義の配列で組み立て、`002`、`003` が列を足せるようにする。

## Technical Context

**Language/Version**: TypeScript 6.0、Node.js 24 LTS（`000-app-basic` と同じ）

**Primary Dependencies**:
- 既存: Next.js 16.3（App Router）、React 19、Better Auth 1.7.5、Drizzle ORM 0.45、pg 8、pg-boss 12、Zod 4、pino
- 追加: kuromoji 0.1.2（漢字の読みの推定。research R3）、wanakana 5.3.1（仮名とローマ字の変換）

**Storage**: PostgreSQL 17。拡張 `pg_trgm` を有効にする

**Testing**: Vitest 5（単体と、実際の PostgreSQL を使う結合テスト）、Playwright 1.63（E2E）

**Target Platform**: Linux（Docker）上の Node.js。利用者の環境は、Chrome、Edge、Safari、Firefox の最新 2 版（PC とスマートフォン）

**Project Type**: Web アプリケーション（Next.js、worker、取り込み CLI）

**Performance Goals**:
- 1 候補の照合が p95 で 30 秒以内（SC-002、NFR-PE-002）。1 回の試行を 30 秒で打ち切り、全体は 2 分で「不明」にする
- 画面の応答が p95 で 1 秒以内（SC-009、NFR-PE-001）

**Constraints**:
- VPS 2GB に web、worker、PostgreSQL が同居する。kuromoji の辞書は worker だけで、必要なときに読み込み、10 分使わなければ手放す（読み込み中は約 390MB。research R3）
- 商標データの件数と容量は未確認である（`docs/architecture.md` §9 R3）。索引は GIN（trgm、区分）と btree に限る
- 特許庁のデータの項目定義は申込の後に確定する（research R1）

**Scale/Scope**: 利用者は MVP で数百人。画面は 3（トップ、入力、結果）。月の照合は最大で 利用者数 × 50 候補

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則・基準 | 確認 | 結果 |
|---|---|---|
| I. 仕様駆動開発 | spec.md（clarify 2 回済み）から plan を作っている。成果物は日本語で書いている | ✅ |
| II. 候補名の機密性 | チェックの読み出しは `user_id` を条件にした関数だけを通し、他人のものは 404（R9）。FK の CASCADE で退会時に消える。ジョブのデータは候補の ID だけ。ログの伏せ字に候補の項目を足す。外部には何も送らない。認可のテストを書く | ✅ |
| III. 外部サービスの規約と差し替え | J-PlatPat の画面は取得せず、固定アドレスへのリンクだけにする（R8）。商標データは `TrademarkSource` と取り込み用 TSV で取得元から切り離す（R1）。照合の失敗は候補ごとの「不明」にし、やり直せる。1 回の試行は 30 秒、再試行は 1 回、全体の期限は 2 分。外部 API を呼ばないため、キャッシュと支出の上限は対象外 | ✅ |
| IV. 結果を誤認させない | 結果と同じ画面に免責、基準日、調べた日時を出す。「見つからなかった」と表現し、空きとは断定しない。基準日が 30 日を超えたら注意を出す。結果は調べた時点の写しを保存する | ✅ |
| V. テストファースト | 正規化、読み、類似の度合い、分類、利用回数、期限、認可を先にテストで書く。照合は検証用データを入れた実 DB の結合テストで確かめる。E2E で一括チェックの実行と比較表の表示を確かめる | ✅ |
| VI. シンプルさと費用 | 技術は `docs/architecture.md` のとおり（`pg_trgm` は §3 で候補に挙がっている）。追加の依存は kuromoji と wanakana で、どちらも無料。月額への影響はない。新しい実行単位 `apps/importer` は §2 にある | ✅ |
| NFR-PE-001、NFR-PE-002 | 照合は索引を使う 2〜3 回の問い合わせで行う。E2E で画面の応答を、結合テストで照合の所要時間を計測する | ✅ |
| NFR-SE-002、NFR-SE-004、NFR-SE-007 | 入力は Zod とアプリの検証を通し、表示は React のエスケープに任せる。ログに候補名を出さない。認可のテストを書く | ✅ |
| NFR-DA-004、NFR-DA-005 | チェックと利用回数は FK の CASCADE で即時に消える。商標データはバックアップの対象から外してよい | ✅ |
| NFR-AV-003 | 取り込みはデータセットの切り替えで行い、途中でも照合を止めない。長時間の作業ではメンテナンス表示を使う | ✅ |
| NFR-CT-001、NFR-CT-002 | 外部の有料 API を使わない。利用回数の上限（月 50）で後続の機能の費用も抑える | ✅ |
| NFR-UX-001〜003 | 入力欄と区分の選択にラベルを付ける。比較表は `<table>` と見出しで作り、スマートフォンでは横にスクロールさせる。E2E で axe の検査を行う | ✅ |
| NFR-OP-006 | 商標データの取り込みの手順を `docs/ops/` に書く | ✅ |

**Phase 1 の後の再確認**: data-model と contracts でも違反はない。特許庁の TSV からの変換（`JpoBulkMapping`）は、申込の後に項目定義書に合わせて作る。本番公開の前提条件として quickstart §5 に残す（clarify 1 回目の決定）。

## Project Structure

### Documentation (this feature)

```text
specs/001-trademark-batch-check/
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
packages/trademark/            # @app/trademark（新規。DB に依存しない照合のロジック）
├── src/normalize.ts           # 正規化と入力の検証（R2）
├── src/parse-input.ts         # 入力欄の解析（行、読み、重複のまとめ）
├── src/reading.ts             # 読みの推定（R3）。ReadingEstimator
├── src/kana.ts                # モーラへの分割、称呼キー
├── src/similarity.ts          # 重み付き編集距離と度合い（R4）
├── src/classify.ts            # 結果の分類（FR-013）
├── src/classes.ts             # 区分 1〜45 の説明
├── src/source.ts              # TrademarkSource（アダプタの型）
├── src/jplatpat.ts            # 公式サービスへのリンク（R8）
└── tests/

packages/db/src/usage-ledger.ts # 利用回数を数える・戻す、候補を「不明」にする、期間の計算（web と worker で共有。research R6）
packages/db/src/schema/
├── trademarks.ts              # trademark_datasets、trademark_marks、trademark_readings
└── checks.ts                  # checks、check_candidates、trademark_results、usage_counters、app_settings

packages/shared/src/queues.ts  # trademark-check、expire-trademark-checks を足す
packages/shared/src/logger.ts  # 伏せ字の項目を足す

apps/web/src/
├── checks/                    # サーバー側の処理（web）
│   ├── repository.ts          # findOwnedCheck など、本人に限った読み出し（R9）
│   ├── start-check.ts         # 実行（検証、ロック、利用回数、ジョブ登録）
│   ├── retry.ts               # やり直し
│   ├── usage.ts               # 残り、上限値、実行中の件数
│   ├── jobs.ts                # 照合のジョブの送信（CheckJobSender）
│   ├── presentation.ts        # 日時、基準日の古さ、区分の表示、入力の引き継ぎ
│   └── columns.tsx            # 比較表の列の定義（R7）
├── app/(app)/page.tsx         # トップ（直近 5 件、残り）
├── app/(app)/checks/new/      # 入力画面（page.tsx、check-form.tsx、class-picker.tsx）
├── app/(app)/checks/[id]/     # 結果画面（page.tsx、auto-refresh.tsx）
└── app/(app)/checks/actions.ts# startCheck、retryCandidate

apps/worker/src/jobs/
├── trademark-check.ts         # 候補の照合
├── expire-trademark-checks.ts # 期限切れの処理
└── pg-trademark-source.ts     # TrademarkSource の PostgreSQL 実装

apps/importer/                 # @app/importer（新規）
├── src/cli.ts                 # import、seed-fixture
├── src/testing.ts             # テスト用: 検証用データの取り込み
├── src/tsv.ts                 # 取り込み用 TSV の読み取りと検証
├── src/load.ts                # データセットへの取り込み
└── fixtures/sample-trademarks.tsv

docs/ops/trademark-import.md   # 取り込みの手順（NFR-OP-006）
```

**Structure Decision**: 照合のロジックは web と worker の両方で使う（入力の検証は web、照合は worker）ため、`packages/trademark` に分ける。DB を読む `TrademarkSource` の実装は worker に置く。取り込みは `docs/architecture.md` §2 の `importer` として `apps/importer` を足す。

## Complexity Tracking

憲章の違反はない。
