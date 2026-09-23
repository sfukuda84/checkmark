---

description: "候補名の一括チェックと商標照合（001-trademark-batch-check）の実装タスク"
---

# Tasks: 候補名の一括チェックと商標照合

**Input**: `/specs/001-trademark-batch-check/` の設計文書

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 憲章 V（ドメインのロジックはテストファースト）により、テストのタスクを含める。各ストーリーでは、テストを先に書き、失敗することを確かめてから実装する。

**Organization**: ユーザーストーリーごとにタスクをまとめ、ストーリーごとに実装とテストができるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行して進められる（別のファイルで、未完了のタスクに依存しない）
- **[Story]**: 対象のユーザーストーリー（US1〜US5）
- パスは plan.md の「Source Code」に従う

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 新しいパッケージと実行単位の骨組み

- [ ] T001 `packages/trademark`（`@app/trademark`）を作る。`package.json`（依存: kuromoji 0.1.2、wanakana 5.3.1）、`tsconfig.json`、`vitest.config.ts`、`src/index.ts`。ルートの vitest の projects に加える
- [ ] T002 [P] `apps/importer`（`@app/importer`）を作る。`package.json`（scripts: `import`、`seed-fixture`、`typecheck`）、`tsconfig.json`、`vitest.config.ts`、`src/cli.ts` の骨組み。ルートの vitest の projects に加える
- [ ] T003 [P] `packages/shared/src/queues.ts` に `trademark-check`（retryLimit 1、retryDelay 5、expireInSeconds 30、deleteAfterSeconds 86400）と `expire-trademark-checks` を足す（contracts/jobs-and-cli.md §1）
- [ ] T004 [P] `packages/shared/src/logger.ts` の伏せ字に `inputtext`、`normalizedtext`、`reading`、`userreading`、`marktext` を足し、`packages/shared/tests/logger.test.ts` にテストを足す（FR-031、research R9）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: すべてのストーリーの前提になる DB、照合のロジック、取り込み

**⚠️ CRITICAL**: このフェーズが終わるまで、ストーリーの作業は始めない

- [ ] T005 `packages/db/src/schema/trademarks.ts` に `trademark_datasets`、`trademark_marks`、`trademark_readings` を data-model.md §1〜3 のとおり定義する
- [ ] T006 `packages/db/src/schema/checks.ts` に `checks`、`check_candidates`、`trademark_results`、`usage_counters`、`app_settings` を data-model.md §4〜8 のとおり定義する（`user_id` は ON DELETE CASCADE）
- [ ] T007 マイグレーションを作る（`pnpm db:generate`）。`create extension if not exists pg_trgm` と、`reading_key` の GIN（gin_trgm_ops）索引と btree（text_pattern_ops）索引、`classes` の GIN 索引を手で足す。`packages/db/migrations/`。あわせて、テストの `resetDb` に新しいテーブルを足す（`apps/web/tests/helpers/db.ts`、worker と importer のテストの共通の準備）
- [ ] T008 [P] 正規化と入力の検証のテストを書く。NFKC、ひらがな→カタカナ、小文字化、空白、使える文字、50 文字、読みの検証（research R2、FR-003、FR-004、FR-004a）。`packages/trademark/tests/normalize.test.ts`
- [ ] T009 [P] 入力欄の解析のテストを書く。空行、`候補名 / ヨミ`、重複のまとめと件数、行番号つきのエラー。`packages/trademark/tests/parse-input.test.ts`
- [ ] T010 [P] 仮名のテストを書く。モーラへの分割（拗音、促音、長音）、称呼キー（research R4）。`packages/trademark/tests/kana.test.ts`
- [ ] T011 [P] 類似の度合いのテストを書く。同一 = 1、清濁の違い、母音違い、長音・促音の有無、無関係の組、0.6 の閾値（research R4、SC-004）。`packages/trademark/tests/similarity.test.ts`
- [ ] T012 [P] 結果の分類のテストを書く。同一あり、類似あり、見つからなかった、同一は類似の一覧に入れない、上位 20 件（FR-009、FR-013）。`packages/trademark/tests/classify.test.ts`
- [ ] T013 T008 を通す実装を書く。`packages/trademark/src/normalize.ts`
- [ ] T014 T009 を通す実装を書く。`packages/trademark/src/parse-input.ts`
- [ ] T015 T010 を通す実装を書く。`packages/trademark/src/kana.ts`
- [ ] T016 T011 を通す実装を書く。`packages/trademark/src/similarity.ts`
- [ ] T017 T012 を通す実装を書く。`packages/trademark/src/classify.ts`
- [ ] T018 [P] 区分 1〜45 の番号と説明を定数で書く（FR-006）。`packages/trademark/src/classes.ts`
- [ ] T019 [P] `TrademarkSource`（`activeDataset()`、`findIdentical(normalizedText, classes)`、`findSimilarCandidates(readingKey, classes)`、`readingsForText(normalizedText)`）の型を書く（憲章 III）。`packages/trademark/src/source.ts`
- [ ] T020 [P] 公式サービスへのリンクを作る関数とテストを書く（research R8、FR-012）。`packages/trademark/src/jplatpat.ts`、`packages/trademark/tests/jplatpat.test.ts`
- [ ] T021 取り込み用 TSV の読み取りと検証のテストを書く（必須列、区分の範囲、`dead`、称呼の区切り）。`apps/importer/tests/tsv.test.ts`
- [ ] T022 T021 を通す実装を書く。`apps/importer/src/tsv.ts`
- [ ] T023 取り込みの結合テストを書く（full と delta、`dead` の削除、失敗時に前の active を使い続ける、称呼キーの保存）。`apps/importer/tests/load.test.ts`
- [ ] T024 T023 を通す実装を書く。`apps/importer/src/load.ts`、`apps/importer/src/cli.ts`（`import`、`seed-fixture`）
- [ ] T025 [P] 検証用データを作る。同一、称呼同一、1 音違い、清濁違い、長音の有無、区分違い、無関係、英字の商標（称呼つき）の組を含める。`apps/importer/fixtures/sample-trademarks.tsv`
- [ ] T026 [P] 取り込みの手順を書く（申込が通るまでの扱い、`JpoBulkMapping` の未実装を含む。NFR-OP-006）。`docs/ops/trademark-import.md`

- [ ] T067 利用回数を数える・戻す基本処理（`chargeCandidates`、`refundCandidate`。`charged` を false にしてから `charged_period` の行から引き、二重に戻さない）を、テストを先に書いて作る。web（実行、やり直し、ジョブ登録の失敗）と worker（最後の試行の失敗、期限切れ）の両方から使う（FR-026、FR-026a、research R6）。`packages/db/src/usage-ledger.ts`、`packages/db/tests/usage-ledger.test.ts`

**Checkpoint**: 照合のロジックと商標データの取り込みができた

---

## Phase 3: User Story 1 - 候補を一括で入力して商標の照合結果を比較表で見る (Priority: P1) 🎯 MVP

**Goal**: 候補をまとめて実行し、同一・類似の結果を比較表で見られる

**Independent Test**: 候補 3 件（同一あり、類似のみ、該当なし）を実行し、比較表の結果を確かめる

### Tests for User Story 1

- [ ] T027 [P] [US1] 読みの推定のテストを書く。利用者の読み、仮名だけの候補、既存商標の称呼の流用、漢字（kuromoji）、ローマ字、大文字の略語、数字、読みが空になる場合（research R3、FR-014）。`packages/trademark/tests/reading.test.ts`
- [ ] T028 [P] [US1] `PgTrademarkSource` の結合テストを書く。同一、称呼の trigram 抽出、短いキーの補助の抽出、区分の重なり（検証用データを取り込んだ DB）。`apps/worker/tests/pg-trademark-source.test.ts`
- [ ] T029 [P] [US1] 照合のジョブの結合テストを書く。結果の写し、基準日、`done` への遷移、退会済み・attempt 違いの無視、データなしで `unknown`、SC-003（同一 100%）と SC-004（類似 90% 以上）の検証用データでの確認、ログに候補名が出ないこと。`apps/worker/tests/trademark-check.test.ts`
- [ ] T030 [P] [US1] 実行の結合テストを書く。解析と検証のエラー、10 件の上限（FR-002）、チェックと候補の作成（FR-007）、ジョブの登録、登録の失敗で `unknown`。`apps/web/tests/integration/start-check.test.ts`
- [ ] T031 [P] [US1] 認可の結合テストを書く。他人のチェックの読み出しが見つからない、運営者でも見えない（FR-030、SC-005）。`apps/web/tests/integration/check-authorization.test.ts`

### Implementation for User Story 1

- [ ] T032 [US1] T027 を通す実装を書く。`packages/trademark/src/reading.ts`（kuromoji は初回に 1 回だけ読み込む）
- [ ] T033 [US1] T028 を通す実装を書く。`apps/worker/src/jobs/pg-trademark-source.ts`
- [ ] T034 [US1] T029 を通す実装を書く。`apps/worker/src/jobs/trademark-check.ts`、`apps/worker/src/index.ts` への登録
- [ ] T035 [US1] 本人に限った読み出し（`findOwnedCheck`、`listRecentChecks`）を書く。`apps/web/src/checks/repository.ts`
- [ ] T036 [US1] 実行の処理を書く（T030 を通す。利用回数と同時実行は US5 で足す）。`apps/web/src/checks/start-check.ts`、`apps/web/src/jobs/client.ts` にジョブ登録を足す
- [ ] T037 [US1] Server Action `startCheck` を書く。`apps/web/src/app/(app)/checks/actions.ts`、エラーの文言を `apps/web/src/lib/error-messages.ts` に足す
- [ ] T038 [US1] 入力画面を作る（候補の入力欄、実行）。`apps/web/src/app/(app)/checks/new/page.tsx`、`check-form.tsx`
- [ ] T039 [US1] 比較表の列の定義と商標の列を作る（research R7、FR-018）。`apps/web/src/checks/columns.tsx`
- [ ] T040 [US1] 結果画面を作る（比較表、該当商標の一覧、公式サービスへのリンク、読みと推定の表示、免責、基準日、30 日超の注意）。`apps/web/src/app/(app)/checks/[id]/page.tsx`（FR-011〜FR-016、FR-015a）
- [ ] T041 [US1] E2E を書く。検証用データを global-setup で取り込み、3 件の候補を実行して比較表の結果、免責、基準日、axe の検査を確かめる。入力から比較表の画面に移るまでの時間（SC-001）と、画面の応答時間（SC-009）を計測する。`apps/web/tests/e2e/checks-us1.spec.ts`、`apps/web/tests/e2e/global-setup.ts`

**Checkpoint**: US1 だけで、一括チェックと商標の比較表が使える

---

## Phase 4: User Story 2 - 商標の区分を選んで絞り込む (Priority: P2)

**Goal**: 区分を選んで照合を絞り込める

**Independent Test**: 第 9 類だけを選び、該当が第 9 類を含む商標だけになることを確かめる

- [ ] T042 [P] [US2] 区分の絞り込みの結合テストを書く（選んだ区分、区分なし＝全区分、不正な区分。FR-005、FR-010）。`apps/worker/tests/trademark-check-classes.test.ts`、`apps/web/tests/integration/start-check.test.ts` に追加
- [ ] T043 [US2] 入力画面に区分の選択（説明つき、既定は全区分）を足し、`startCheck` で区分を検証して保存する。`apps/web/src/app/(app)/checks/new/class-picker.tsx`
- [ ] T044 [US2] 結果画面に選んだ区分（または「全区分」）を示す。`apps/web/src/app/(app)/checks/[id]/page.tsx`
- [ ] T045 [US2] E2E に区分の絞り込みを足す。`apps/web/tests/e2e/checks-us2.spec.ts`

---

## Phase 5: User Story 3 - 進捗を見ながら待ち、画面を閉じても後から結果を見る (Priority: P2)

**Goal**: 候補ごとに結果が埋まり、トップ画面から直近のチェックに戻れる

**Independent Test**: 実行してタブを閉じ、トップから開き直して結果がそろっていることを確かめる

- [ ] T046 [P] [US3] 期限切れの処理の結合テストを書く（2 分を過ぎた `queued` / `running` を `unknown`、後から来た結果を捨てる）。`apps/worker/tests/expire-trademark-checks.test.ts`
- [ ] T047 [P] [US3] 直近 5 件の読み出しのテストを書く（新しい順、本人だけ、完了件数）。`apps/web/tests/integration/recent-checks.test.ts`
- [ ] T048 [US3] T046 を通す実装を書き、毎分の定期実行に登録する。`apps/worker/src/jobs/expire-trademark-checks.ts`、`apps/worker/src/jobs/schedules.ts`
- [ ] T049 [US3] 結果画面に進み具合と「確認中」、実行中の自動の読み直し（2 秒）を足す。`apps/web/src/app/(app)/checks/[id]/auto-refresh.tsx`
- [ ] T050 [US3] トップ画面に直近 5 件のチェックと新しいチェックへの導線を出す。`apps/web/src/app/(app)/page.tsx`
- [ ] T051 [US3] E2E を書く（進み具合、画面を開き直す、トップの直近のチェック、他人の URL は 404）。`apps/web/tests/e2e/checks-us3.spec.ts`

---

## Phase 6: User Story 4 - 失敗した候補をやり直す (Priority: P2)

**Goal**: 「不明」の候補だけをやり直せる

**Independent Test**: 失敗させた候補が「不明」になり、やり直すと結果が出ることを確かめる

- [ ] T052 [P] [US4] やり直しの結合テストを書く（`unknown` だけ、attempt と期限の更新、ジョブの登録、他人の候補は `NOT_FOUND`、結果のある候補は `NOT_RETRYABLE`、最後の試行の失敗で `unknown`、一部の候補が失敗してもほかの候補は `done` になる（FR-023、SC-008））。`apps/web/tests/integration/retry-candidate.test.ts`、`apps/worker/tests/trademark-check.test.ts` に追加
- [ ] T053 [US4] T052 を通す実装を書く。`apps/web/src/checks/retry.ts`、Server Action `retryCandidate`
- [ ] T054 [US4] 結果画面の「不明」のセルにやり直しのボタンを出す。`apps/web/src/checks/columns.tsx`
- [ ] T055 [US4] 推定した読みの候補に、読みを添えてチェックし直す導線（`/checks/new?from=<id>`）を足す（FR-014a）。`apps/web/src/app/(app)/checks/new/page.tsx`

---

## Phase 7: User Story 5 - 利用回数の残りを確かめ、上限を超えて実行しない (Priority: P2)

**Goal**: 暦月 50 候補の上限を守り、残りを示す

**Independent Test**: 残り 3 件で 5 件を実行できないこと、失敗分が戻ることを確かめる

- [ ] T056 [P] [US5] 期間と残りの計算の単体テストを書く（日本時間の暦月、月末の境界、次に戻る日時、上限値の既定 50 と設定値）。`apps/web/tests/unit/usage.test.ts`
- [ ] T057 [P] [US5] 利用回数の結合テストを書く（FR-026、FR-026a、FR-027、FR-027a。数える、超えたら `QUOTA_EXCEEDED`、同時の実行で超えない、実行中 3 件で `TOO_MANY_RUNNING`、`unknown` で戻る、二重に戻さない、やり直しで数える）。`apps/web/tests/integration/usage.test.ts`
- [ ] T058 [US5] T056 と T057 を通す実装を書く。`apps/web/src/checks/usage.ts`（期間、残り、上限値）、`start-check.ts` と `retry.ts` への利用者ごとのロックと、残りと実行中の件数の確認（数える・戻すは T067 の `usage-ledger.ts` を使う）
- [ ] T059 [US5] 入力画面とトップに残りと戻る日時を出し、残り 0 件なら実行できないようにする。`apps/web/src/app/(app)/checks/new/page.tsx`、`apps/web/src/app/(app)/page.tsx`
- [ ] T060 [US5] E2E を書く（残りの表示、超えたときのエラー）。`apps/web/tests/e2e/checks-us5.spec.ts`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T061 [P] 退会で、チェック、候補、結果、利用回数が消えることの結合テストを書く（FR-033、NFR-DA-004）。`apps/web/tests/integration/account.test.ts` に追加
- [ ] T062 [P] 照合、実行、やり直し、期限切れのログを取り込み、候補名と読みが 1 件も出ないことを確かめる結合テストを書く（SC-006、FR-031）。`apps/worker/tests/log-redaction.test.ts`
- [ ] T063 [P] 照合の所要時間を結合テストで計測し、検証用データで 1 候補 30 秒以内であることを確かめる（SC-002）。`apps/worker/tests/trademark-check.test.ts`
- [ ] T064 [P] 比較表のスマートフォンでの表示（横スクロール）と、フォームのラベルを整える（NFR-UX-002、NFR-UX-003）。`apps/web/src/app/globals.css`
- [ ] T065 `.env.example` と README に、検証用データの取り込みの手順を足す
- [ ] T066 quickstart.md のシナリオを通しで確かめ、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` を通す

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**: 依存なし
- **Foundational（Phase 2）**: Setup の後。すべてのストーリーの前提になる。T067（利用回数の数える・戻す）は T006 の後で、US1 の T034、T036 より前に終える
- **US1（Phase 3）**: Foundational の後。ほかのストーリーの前提になる（チェックの実体、ジョブ、結果画面）
- **US2（Phase 4）**: US1 の後
- **US3（Phase 5）**: US1 の後。US2 と並行できる
- **US4（Phase 6）**: US1 の後。US3 の期限切れがあると確かめやすい
- **US5（Phase 7）**: US1 の後。利用回数の戻しは US4 の `unknown` の遷移を使う
- **Polish（Phase 8）**: すべてのストーリーの後

### Within Each User Story

- テスト → 実装の順。テストが失敗することを確かめてから実装する
- ロジック → サーバー処理 → 画面 → E2E の順

### Parallel Opportunities

- Phase 1 の T002、T003、T004
- Phase 2 の T008〜T012（テスト）、T018〜T020、T025、T026
- 各ストーリーの `[P]` のテスト
- US1 の後は、US2 と US3 を並行できる

---

## Parallel Example: User Story 1

```bash
# テストを並行して書く
Task: "T027 packages/trademark/tests/reading.test.ts"
Task: "T028 apps/worker/tests/pg-trademark-source.test.ts"
Task: "T030 apps/web/tests/integration/start-check.test.ts"
Task: "T031 apps/web/tests/integration/check-authorization.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 と Phase 2 を終える
2. Phase 3（US1）を終える
3. quickstart.md のシナリオ 1、2 で確かめる

### Incremental Delivery

1. 基盤 → US1（一括チェックと比較表）
2. US2（区分）→ US3（進捗と直近のチェック）
3. US4（やり直し）→ US5（利用回数の上限）
4. Polish

---

## Notes

- 特許庁の一括ダウンロードの TSV からの変換（`JpoBulkMapping`）は、申込が通って項目定義書を入手してから作る（research R1、quickstart §5）。この tasks.md の範囲には含めない
- ログとジョブのデータに候補名を入れない（憲章 II）
