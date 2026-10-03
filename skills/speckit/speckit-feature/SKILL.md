---
name: "speckit-feature"
description: "フィーチャーの仕様工程を実行するスキル。Git worktree の準備（既存があれば再利用して続きから再開）、仕様作成（speckit-specify）、仕様明確化（speckit-clarify x 2）、画面仕様（speckit-design。--with-mock で Claude Design のモックも作る）、詳細設計（speckit-plan）、タスク分解（speckit-tasks）、整合性検証（speckit-analyze x 3）を行い（clarify・画面仕様・analyze の回数は機能の重さ（軽・標準・重）で減る）、main へのマージと後片付けまでを実行する。実装は speckit-coding、通しは speckit-all で行う。"
argument-hint: "フィーチャー番号または範囲と、任意の --auto、--with-mock、--weight 軽|標準|重（例: 001, 002-005, all, all --auto, 003 --with-mock, または省略して次の未着手）"
compatibility: "Requires git, spec-kit project structure with .specify/ directory"
user-invocable: true
disable-model-invocation: false
---

# speckit-feature スキル（仕様工程: S1 → S2〜S7-3 → S12）

フィーチャーごとに、worktree の準備、仕様作成、明確化 2 回、画面仕様、詳細設計、タスク分解、整合性検証 3 回を行い、仕様・設計・タスクを `main` にマージする。

- 実装工程（S8〜S11）は [`speckit-coding`](../speckit-coding/SKILL.md) が担当する。
- 仕様から実装までを 1 つの worktree で通して行う場合は [`speckit-all`](../speckit-all/SKILL.md) を使う。`speckit-all` は、このファイルの「§3 本体」だけを実行する。

**ステップ番号、ヘルパースクリプト（`$HELPER`）、再開、安全規則、対話、引数の解釈は [`speckit-worktree`](../speckit-worktree/SKILL.md) に従う。** 作業を始める前に必ず読むこと。

## 1. ユーザー入力・引数

```text
$ARGUMENTS
```

引数の解釈と複数フィーチャーの進め方は `speckit-worktree` の §5 に従う。`--auto` があるときは、下の 💬 の質問も含めて `speckit-worktree` §6 の自動モードで進める。`--with-mock` があるときは、S4-1 で Claude Design のモックを作る。自動検出では `--phase spec` を使う。

## 2. 実行の流れ（単独実行）

対象フィーチャーごとに、次を順に行う。

1. **S1 準備**: `speckit-worktree` §3「S1 準備」に従い、`$HELPER ensure <feature> --phase spec` を実行する。
2. **本体**: 下の §3 の S2〜S7-3 のうち、`NEXT_STEP` 以降を順に実行する。
3. **S12 片付け**: `speckit-worktree` §3「S12 片付け」に従い、`$HELPER finish <FEATURE_NAME> --phase spec` を実行する。
4. 次のフィーチャーがあれば 1 に戻る。

## 3. 本体（S2〜S7-3）

作業場所は `WORKTREE_DIR`、仕様ディレクトリは `specs/<FEATURE_NAME>`（以下 `FEATURE_DIR`）である。各ステップの最後に `speckit-worktree` §2 の subject で `checkpoint` を記録する。

機能の重さ（S1 の `WEIGHT`）によって、clarify・画面仕様・analyze の回数が変わる（`speckit-worktree` §2「機能の重さ」）。省くステップは本体を行わず、`checkpoint ... --skipped "<重さ>: <理由>"` で記録する。

| 重さ | 省くステップ |
|---|---|
| 軽 | S4（clarify は S3 の 1 回、最大 3 問）、S4-1（画面がないとき）、S7-2、S7-3 |
| 標準 | S4-1（画面がないとき）、S7-3 |
| 重 | なし |

### 質問の窓

ユーザーへの質問は、ステップごとに出さず、次の 2 つの「窓」にまとめる。1 回の質問は最大 4 問とし、推奨案（`**Recommended:**`）と理由を添えて AskUserQuestion などで聞く（選択肢と推奨案で答えられる形にする）。1 つの窓では、質問を最大 3 回まで出せる（1 つの窓で最大 12 問）。

| 窓 | 時機 | 集める論点 |
|---|---|---|
| 窓 1（仕様の前） | S2 の前（機能概要と入力を読んだ直後） | スコープ、作る対象、前提条件、利用者と権限の範囲。S3 の clarify で出しそうな最重要の論点も先に聞いてよい |
| 窓 2（計画の前） | S5 の前（S4-1 の後） | clarify の論点（S3・S4 で出たもの）、画面の構成（S4-1）、S2〜S4-1 で仮に決めたこと、アーキテクチャの分岐の見込み |

- **窓の中の回数**: 1 回目は最重要の論点を最大 4 問で聞く。2 回目と 3 回目は、回答から新たに出た論点か、1 回目に入らなかった論点があるときだけ出す。論点がなくなったら、3 回を待たずに窓を閉じる。3 回を超える論点は推奨案で決め、`FEATURE_DIR/decisions.md` に書いて S8 の終わりの確認に回す。
- **窓と窓のあいだ**: 窓のあいだに出た論点は、推奨案で仮に進め、次の窓で確かめる。clarify の質問（S3・S4）も、ステップの中では聞かずに窓 2 に回す。clarify の回答が出るまでは推奨案で仮に本文へ反映し、`## Clarifications` の行末に `（仮）` を付けておく。窓 2 の回答で `（仮）` を外して確定させ、変わった箇所を直す（S5 の前に、変更を通常のコミットにする）。
- **再開したとき**: 窓 1 は S2 から始めるときだけ開く。S5 から再開したときは、`## Clarifications` に `（仮）` が残っていれば窓 2 を開く（窓 2 を開く前に中断した場合）。
- **窓 2 の後（S5〜S7）**: 出た判断（ライブラリの選定、analyze の修正方針のトレードオフ）は、推奨案で進めて `decisions.md` に記録し、S8 の終わりの確認（`speckit-coding` の S8）にまとめる。
- **軽の機能**: 窓は窓 1 だけにする。S3 の clarify の論点のうち窓 1 で聞けなかったものと、それ以降の論点は、推奨案で決めて `decisions.md` に書き、S8 の終わりの確認にまとめる。
- **窓の外で聞いてよいもの**: 窓まで待つと作業が無駄になる前提の誤り（作る対象の取り違え、憲章・`docs/architecture.md`・`docs/nfr.md` に反する要求など）だけである。
- **自動モード（`--auto`）**: 窓を開かず、推奨案を採用して `auto-decisions.md` に記録する。
- **単独の `speckit-feature`**: 窓 2 の後に出た判断は `decisions.md` に残し、マージの後の `speckit-coding` の S8 の終わりに確かめる。完了報告にも一覧を載せる。

### 入力情報

各ステップで、存在するものを参照する。

- 機能概要 `docs/feature/<FEATURE_NAME>.md`（例: `docs/feature/001-clinic-setup.md`）。なければ旧形式の `docs/feature/<slug>.md`（`<slug>` は `FEATURE_NAME` から先頭の番号を除いたもの）。`speckit-concept-2-feature` の出力で、末尾の「`/speckit-specify` に渡す記述案」を S2 の入力に使う。
- 前提メモ `docs/feature/premises.md`、着手順序 `docs/feature/spec_order.md`
- コアコンセプト `docs/concept/`（なければ `docs/conpect/`）
- プロジェクト憲章 `.specify/memory/constitution.md`
- デザインの共通の決め事 `docs/design/`（`DESIGN.md`、`EXPERIENCE.md`、トークン）と、S4-1 で作る画面仕様 `FEATURE_DIR/ui.md`
- 引数やプロンプトで与えられた追加指示

機能概要がなく、追加指示もない場合は、何を作るかをユーザーに質問してから S2 に進む。

### S2: 仕様作成（speckit-specify）

1. `speckit-specify` スキルの手順に従い、仕様書 `FEATURE_DIR/spec.md` を作る。
   - `SPECIFY_FEATURE_DIRECTORY` には `specs/<FEATURE_NAME>` を明示的に指定する。worktree はすでにこのディレクトリを前提に作られているため、新しい番号のディレクトリを作らない。
   - **WHAT（何を提供するか）と WHY（なぜ必要か）**に集中し、HOW（言語、フレームワーク、DB などの実装詳細）は書かない。
   - ユーザーストーリー（P1、P2、P3… の優先順。ストーリーごとのゴールと受入基準）
   - 機能要件（FR-001、FR-002… 各要件が検証可能であること）
   - 測定可能な成功基準（SC-001、SC-002… 時間、件数、率などの技術に依存しない指標）
   - 主要エンティティ、エッジケース、前提条件
2. 品質チェックリスト `FEATURE_DIR/checklists/requirements.md` を作り、初回の検証を行う。
3. `checkpoint <FEATURE_NAME> S2` を記録する。

> 💬 仕様上の前提条件やスコープの疑問は、窓 1 で聞く（窓 1 の後に出たものは窓 2 に回す）。

### S3: 仕様の明確化 1 回目（コア要件・振る舞い）

1. `speckit-clarify` スキルの手順で `spec.md` をスキャンし、機能スコープ、ユーザージャーニー、ドメインのデータモデル、必須の制約などの曖昧さと決定漏れを特定する。
2. 最重要の論点を、推奨選択肢（`**Recommended:**`）とその理由を添えてまとめる。ステップの中では質問せず、窓 1 で聞いていなければ窓 2 に回す（`speckit-clarify` の質問の手順は、窓で聞く形に読み替える）。回答が出るまでは推奨案で仮に反映する。軽の機能は窓 2 がないので、推奨案で決めて `decisions.md` に書く（最大 3 問分の論点に絞る）。
3. 回答（窓 2 までは仮の推奨案）を `spec.md` の `## Clarifications` > `### Session YYYY-MM-DD (Round 1)` に記録し、本文の該当箇所（機能要件、ユーザーストーリー、データモデルなど）に反映する。
4. `checklists/requirements.md` を再評価して更新する。
5. `checkpoint <FEATURE_NAME> S3` を記録する。

### S4: 仕様の明確化 2 回目（エッジケース・非機能・安全性）

軽の機能では行わず、`checkpoint <FEATURE_NAME> S4 "<subject>" --skipped "軽: clarify は 1 回"` で記録する。そのときは、S3 で下の観点のうち重要なものも合わせて確かめる（質問は合わせて最大 3 問）。

1. 1 回目の決定事項を前提に、一段深い境界条件と例外系を洗い出す。
   - エラー処理と障害からの復旧
   - 非機能要件（応答時間の許容値、同時実行と競合の制御、オフラインやキャッシュの動作）
   - セキュリティと権限（権限の境界、認証情報の失効、監査ログ）
   - 外部連携の障害モード（遅延、到達不能、不正な応答）
2. 残る重要な論点を、推奨選択肢とともに窓 2 にまとめる（ステップの中では質問しない）。回答が出るまでは推奨案で仮に反映する。
3. 回答を `### Session YYYY-MM-DD (Round 2)` に記録して本文に反映し、`checklists/requirements.md` を最終更新する。
4. `checkpoint <FEATURE_NAME> S4` を記録する。

### S4-1: 画面仕様（speckit-design）

[`speckit-design`](../speckit-design/SKILL.md) の §3 の手順に従い、`FEATURE_DIR/ui.md` を作る。

1. 画面のない機能、または `docs/design/` が「UI なし」のプロジェクトでは、`ui.md` を「**対象**: UI なし」にして理由を 1 行書く。軽・標準の機能では、`ui.md` を作らずに `checkpoint <FEATURE_NAME> S4-1 "<subject>" --skipped "<重さ>: 画面なし"` で記録してよい（重の機能では省かない）。`docs/design/` がないプロジェクト（デザインの工程を足す前に立ち上げたもの）でも、画面のある機能は「UI あり」として書く（`speckit-design` §3 の 1）。
2. 画面のある機能では、`spec.md` の要件（FR）と画面（`SCR-<番号>-<連番>`）を対応づけ、画面ごとの表示、操作、入力と検証、状態、使うコンポーネントを書く。技術は書かない。
3. `--with-mock` のときは、`speckit-design` §4 の手順で主な画面のモックを Claude Design で作り、案を選んで `ui.md` に反映する。使えない環境では、テキストの仕様だけで進める。
4. `docs/design/EXPERIENCE.md` の画面一覧の、この機能の行を更新する。
5. `validate_design.py docs/design --feature specs/<FEATURE_NAME>` のエラーを 0 件にする。
6. `checkpoint <FEATURE_NAME> S4-1` を記録する。

> 💬 画面の構成や、要件の読み方の判断は、窓 2 に回す。

### S5: 詳細設計と憲章チェック（speckit-plan）

`speckit-plan` スキルの手順に従い、明確化を経た `spec.md`、画面仕様 `ui.md`、憲章に基づいて次の成果物を作る。画面のある機能では、`ui.md` の画面と `DESIGN.md` のコンポーネントを、どの実装（ページ、コンポーネント、トークンの読み込み方）で実現するかを `plan.md` に書く。値はトークンから使う。

1. `FEATURE_DIR/plan.md`: 技術コンテキスト（アーキテクチャ、使用技術、ライブラリ、テスト・ビルドのコマンド）と憲章チェック（各原則、品質ゲートとの整合）。コマンドは開発コマンドの正本（`$HELPER commands`）に合わせる。この機能でコマンドを足したり変えたりするなら、`$HELPER commands set` で正本も直す（`speckit-worktree` §4「開発コマンド」）
2. `FEATURE_DIR/research.md`: 不明点の調査、技術選定の決定事項（Decision）、選定理由（Rationale）、比較した代替案（Alternatives considered）
3. `FEATURE_DIR/data-model.md`: エンティティ、属性と型、リレーション、整合性制約、状態遷移
4. `FEATURE_DIR/contracts/`: API、コマンド、UI コンポーネントなど、外部に公開するインターフェースの契約
5. `FEATURE_DIR/quickstart.md`: 動作確認のシナリオ、テストの実行手順、期待結果

作り終えたら `checkpoint <FEATURE_NAME> S5` を記録する。

> 💬 アーキテクチャのトレードオフやライブラリの選定は、窓 2 で見込みを聞いておき、それ以外は推奨案で進めて `decisions.md` に記録する。`docs/architecture.md` や `docs/nfr.md` から外れる必要があるときだけ、その場で止めて聞く。

### S6: タスク分解（speckit-tasks）

`speckit-tasks` スキルの手順に従い、設計成果物と `spec.md` のユーザーストーリーに基づいて `FEATURE_DIR/tasks.md` を作る。

- 形式: `- [ ] [TaskID] [P?] [Story?] 説明とファイルパス`
- フェーズ構成: Phase 1 Setup → Phase 2 Foundational → Phase 3 以降 User Stories（優先順）→ Final Phase Polish & Cross-Cutting Concerns
- ストーリー間の依存関係、`[P]` タスクの並行実行例、MVP の範囲を示す。

作り終えたら `checkpoint <FEATURE_NAME> S6` を記録する。

### S7-1〜S7-3: 整合性検証 3 回（speckit-analyze）

`tasks.md`、`spec.md`、`plan.md`、`ui.md`、憲章を対象に、`speckit-analyze` スキルの手順で分析と是正を、機能の重さに応じた回数（軽は 1 回、標準は 2 回、重は 3 回）、直列に行う。省く回（軽は S7-2・S7-3、標準は S7-3）は `--skipped` で記録し、行う回のうち最後の回で S7-3 の基準を確かめる。`ui.md` の画面が `plan.md` と `tasks.md` のどこで作られるか、画面を伴う要件がすべて画面に対応しているかも確かめる。各回の終わりに `validate_design.py docs/design --feature specs/<FEATURE_NAME>` も実行し、エラーを 0 件にする。S4-1 を足す前に仕様化を始めた機能で `ui.md` がない場合は、警告が出るだけなので、そのまま進める（仕様工程ではさかのぼって作らない。実装工程の S1 で `MISSING_ARTIFACTS: ui.md` が出て、S8 の前に作る）。各回の終わりに `checkpoint` を記録する。指摘が 0 件で変更がなくても記録する。

1. **S7-1（重大課題・憲章整合・カバレッジ）**: 憲章の MUST 原則との矛盾（CRITICAL）、要件（FR-、SC-）に対応するタスクの未割り当て、仕様と設計の大きな乖離を検出して直す。
2. **S7-2（詳細整合・依存関係・ファイルパス）**: 用語の揺れ、エンティティ定義の不一致、タスクの依存順序の矛盾、ファイルパスの参照のずれを直す。
3. **S7-3（最終確認）**: CRITICAL、HIGH、MEDIUM の不整合が 0 件、憲章違反が 0 件、タスクのカバレッジが 100% であることを確かめる。満たさない場合は直してから記録する。

> 💬 修正方針のトレードオフは、推奨案で直して `decisions.md` に記録する。憲章を変える必要があるときだけ、その場で止めて聞く。

## 4. 完了報告

各フィーチャーの完了時と、指定範囲の全体の完了時に、次を報告する。

- 完了したフィーチャー名と番号、マージコミット
- 各ステップの要約（仕様、設計、タスクの成果物）
- clarify で確定した重要な決定事項と、質問の窓で聞いた回数と問数
- `decisions.md` に記録した、まだ確かめていない判断の一覧（`speckit-coding` の S8 の終わりに確かめる）
- 画面仕様の要約（画面の数、`--with-mock` ならモックの URL。作れなかった場合はその理由）
- analyze の検証結果（行った回数）
- 機能の重さと、省いたステップ（`SKIPPED_STEPS`）
- 飛ばした、または中断したフィーチャーとその理由
- `--auto` のとき: 自動で採用した判断の要約（`auto-decisions.md`）と、止まったフィーチャーについてユーザーに判断してほしい事項
- 次の案内: 実装は `speckit-coding <FEATURE_NAME>`。仕様が未着手のフィーチャーは `$HELPER next --phase spec` の結果
