---
name: "speckit-worktree"
description: "speckit-feature・speckit-coding・speckit-all が共通で使う worktree 管理スキル。フィーチャーごとの Git worktree とブランチの準備（既存があれば再利用）、ステップ完了ごとの進捗コミット、main への --no-ff マージと片付け、中止、進捗の確認を行う。3 スキル共通の実行規則（ステップ番号、再開、安全規則、対話、引数の解釈、自動モード --auto）もここに定める。「フィーチャーの進捗を見せて」「worktree を破棄して」と言われたとき、または /speckit-worktree と打たれたときにも使う。"
argument-hint: "doctor | commands [get|set|unset] | resume <フィーチャー> | pitfalls | status | next --phase spec|coding|all | human-tasks [<フィーチャー>] | deferred-tasks [<フィーチャー>] | sync-status <フィーチャー> | abort <フィーチャー> [--phase deferred]"
compatibility: "Requires git and Python 3.9+, spec-kit project structure with .specify/ directory"
user-invocable: true
disable-model-invocation: false
---

# speckit-worktree スキル（worktree 管理と共通実行規則）

`speckit-feature`（仕様工程）、`speckit-coding`（実装工程）、`speckit-all`（通し）の 3 スキルが共通で使う。フィーチャーの作業はすべて `.worktrees/<FEATURE_NAME>`（ブランチ `feature/<FEATURE_NAME>`）で行い、ステップが終わるたびにコミットして進捗を記録する。中断しても、どのスキルからでも続きのステップから再開できる。

Claude Code、Codex CLI、Antigravity、Kiro CLI、opencode のいずれでも同じ手順で動く。

## 1. ヘルパースクリプト

```bash
python3 <skills>/speckit-worktree/scripts/worktree_helper.py <command> ...
```

以降、この呼び出しを `$HELPER` と書く。

- `<skills>` は、このスキルが置かれた skills ディレクトリ（`.claude/skills`、`.agents/skills`、`.kiro/skills` のいずれか）である。
- スクリプトは Python 3.9 以上の標準ライブラリだけで書かれており、macOS、Linux、Windows で動く。プロジェクトのルートからでも worktree の中からでも実行できる。
- `python3` がない環境（Windows など）では、`python` または `py -3` に読み替える。
- マージ先のブランチ（この文書の `main`）は、環境変数 `SPECKIT_MAIN_BRANCH` があればその名前、なければ `main` である。Claude Code のクラウドセッション（`CLAUDE_CODE_REMOTE=true`）では、`SPECKIT_MAIN_BRANCH` がなければ、メインの作業ツリーの今のブランチ（セッションの作業ブランチ）をマージ先にする。`finish` はマージの後に、そのブランチを origin に push する。出力は `PUSHED`、`PUSH_SKIPPED`、`PUSH_FAILED` のいずれかである。`PUSH_FAILED` のときも、マージは済んでいる。規則はプロジェクトの steering（「Claude Code のクラウドセッション」）に従う。

| コマンド | 用途 |
|---|---|
| `$HELPER ensure <feature> --phase spec\|coding\|all [--weight 軽\|標準\|重]` | S1 準備。worktree があれば再利用し、なければ `main` から作る。機能の重さ（§2「機能の重さ」）も出す |
| `$HELPER state <feature> --phase spec\|coding\|all [--weight 軽\|標準\|重]` | 変更せずに進捗を表示する |
| `$HELPER checkpoint <feature> <step> "<subject>" [--skipped "<理由>" [--force]] [--weight 軽\|標準\|重]` | worktree の変更をすべてコミットし、ステップの完了を記録する。`--skipped` は、機能の重さで省いたステップとして記録する |
| `$HELPER finish <feature> --phase spec\|coding\|all [--allow-unchecked] [--commit-leftovers] [--switch] [--partial]` | S12 片付け。`main` に `--no-ff` でマージし、worktree とブランチを削除する。worktree の外で実行する。`--partial` は一部の Phase だけを先にマージする（§3「一部だけを先にマージする」） |
| `$HELPER ensure\|state\|checkpoint\|finish <feature> ... --phase deferred [--tasks T045,T046]` | 実装までマージ済みの機能の `[後]` のタスクを、専用の worktree で片付ける（§3「後の段階のタスク」） |
| `$HELPER abort <feature> [--phase deferred] [--yes]` | worktree とブランチを破棄する。`--yes` がなければ対象を表示するだけ。`--phase deferred` は後の段階の作業のもの |
| `$HELPER list` | 全フィーチャー名を着手順（`spec_order.md` の並び、その後に番号順）で表示する |
| `$HELPER status` | 全フィーチャーの仕様・実装・worktree の状況と、残っている人のタスク（`[人]`）と後の段階のタスク（`[後]`）の件数を表示する。一部だけをマージしたフィーチャーは実装の列に「（一部をマージ済み）」、後の段階の作業中のものは WORKTREE の列に「後の作業中（対象。次: ステップ）」と出る。Pull Request などで取り込んだフィーチャーは `main` の `tasks.md` の完了状況で、Spec Kit 以前に実装した機能（`specs/` がなく、機能ファイルの状態欄が `実装済み` か `完了`）は状態欄で判定する。worktree を使わずに `NNN-slug` のブランチで作業中のフィーチャーも表示する（この 2 種類は `next` の候補にしない） |
| `$HELPER commands [list \| get <key> \| set <key> <command> \| unset <key>]` | プロジェクトの開発コマンドの正本（`.specify/commands.json`）を読み書きする（§4「開発コマンド」）。今いる作業ツリーのファイルを読み書きし、コミットはしない |
| `$HELPER doctor` | 環境と設定を診断し、`OK` / `WARN` / `ERROR` の行と `SUMMARY` を出す。ERROR があれば終了コード 1（§4「診断」） |
| `$HELPER resume <feature>` | セッションを始めるときの要約。次のステップ、残っている `[人]`・`[後]`・未完了のタスク、確かめていない `decisions.md` の行、`spec.md` の `（仮）`、レビューの backlog を正本から生成し、作業中のメモ（`specs/<feature>/handover.md`）があれば古さと長さを確かめて表示する（§4「引き継ぎ」） |
| `$HELPER pitfalls` | 落とし穴の受け箱（`docs/pitfalls.md`）の件数と、棚卸しが要る項目を表示する。`status` と `finish`（coding / all / deferred）の最後にも出る（`PITFALLS`・`PITFALLS_TRIAGE`） |
| `$HELPER deferred-tasks [<feature>]` | 残っている後の段階のタスク（`[後]`）を一覧する。読む `tasks.md` は `human-tasks` と同じ |
| `$HELPER human-tasks [<feature>]` | 残っている人のタスクを一覧する。worktree があればその `tasks.md`、なければ `main` のもの（メインの作業ツリーが `main` にいれば、コミット前の変更も含む）を読む |
| `$HELPER sync-status <feature>` | `main` にマージ済みのフィーチャーの状態欄を、`tasks.md` に合わせて `完了` か `人の作業待ち` にする。`main` で実行し、変更はコミットしない |
| `$HELPER next --phase spec\|coding\|all [--skip <feature,...>]` | 次に着手すべきフィーチャーを表示する（途中の worktree を優先。`--skip` で除外） |
| `$HELPER resolve <query>` | 番号やスラッグからフィーチャー名を決める |

`ensure` と `state` は次の形で結果を出力する。

```text
REPO_ROOT: /path/to/repo
FEATURE_NAME: 001-todo-cli
BRANCH: feature/001-todo-cli
WORKTREE_DIR: /path/to/repo/.worktrees/001-todo-cli
WORKTREE_STATE: created | reused | reattached | present | absent
PHASE: spec
WEIGHT: 標準
COMPLETED_STEPS: S2 S3
NEXT_STEP: S4
SKIPPED_STEPS: S4-1
MISSING_ARTIFACTS: ui.md
```

`WEIGHT` は機能の重さ（機能ファイルの `**重さ**`。欄がなければ `標準`。`--weight` で上書き）である。`SKIPPED_STEPS` は、`--skipped` で省いたステップがあるときだけ出る。`MISSING_ARTIFACTS` は、実装工程（coding / all）で、仕様工程は済んでいて S8 がまだなのに、実装の前に要る成果物が欠けているときだけ出る（いまは `ui.md` だけ。§3「S1 準備」の 5）。S4-1 を `--skipped` で省いた機能、`docs/design/DESIGN.md` が「UI なし」のプロジェクト、S8 を終えた機能では出ない。

終了コードは、0 が成功、1 がエラー、3 が前提条件を満たさないことを表す。3 のときは標準エラーに `PRECONDITION: <code>` と案内文が出る。

| code | 意味 | 対応 |
|---|---|---|
| `ALREADY_SPECIFIED` | 仕様はすでに `main` にマージ済み | `speckit-coding` を案内する |
| `ALREADY_IMPLEMENTED` | `main` の `tasks.md` がすべて完了済み | そのフィーチャーは完了として扱う |
| `CODING_IN_PROGRESS` | worktree がすでに実装工程に入っている | `speckit-coding` か `speckit-all` での再開を案内する |
| `SPEC_INCOMPLETE` | worktree の仕様工程が途中 | `speckit-feature` か `speckit-all` での再開を案内する |
| `SPEC_MISSING` | spec・plan・tasks がどこにもない | `speckit-feature` か `speckit-all` を案内する |
| `LEFTOVER_CHANGES` | `finish` で、worktree にどのステップのコミットにも含まれていない変更がある | 変更の一覧をユーザーに示す。マージに含めてよければ `--commit-leftovers` を付けて再実行する。含めない変更は、ユーザーの了承を得て取り除く |
| `NOT_ON_MAIN` | `finish` で、メインの作業ツリーが `main` 以外のブランチにいる | 切り替えてよいかをユーザーに確認し、よければ `--switch` を付けて再実行する |
| `NOT_IMPLEMENTED` | `ensure --phase deferred` で、実装がまだ `main` にマージされていない | 残りのタスクは通常の `speckit-coding` で進めるよう案内する |
| `NO_DEFERRED_TASKS` | `ensure --phase deferred` で、`main` の `tasks.md` に未完了の `[後]` がない | 片付けるものはないと報告する |
| `DEFERRED_TARGETS_UNCHECKED` | `finish --phase deferred` で、対象のタスクが `- [x]` になっていない | 対象のタスクを実装して `- [x]` にしてから再実行する |
| `UNCHECKED_TASKS` | `finish`（coding / all）で、`tasks.md` に `[人]`・`[後]` 以外の未完了のタスクが残っている | 未完了のタスクの一覧をユーザーに示す。実装するなら S8 の手順で片付けてから、残したままマージしてよいと確認できたら `--allow-unchecked` を付けて `finish` を再実行する |

`finish`（coding / all）は、未完了のタスクが `[人]`・`[後]` のものだけなら止めずにマージし、標準出力に `HUMAN_TASKS_PENDING: <件数>`・`DEFERRED_TASKS_PENDING: <件数>` と残りのタスクを出す。この一覧はユーザーに示し、§3「人のタスクの片付け」「後の段階のタスク」を案内する。

## 2. ステップ番号

ステップ番号は 3 スキルで共通の通し番号であり、進捗の記録と再開の判定に使う。

| ステップ | 内容 | 担当スキル | チェックポイントの subject |
|---|---|---|---|
| S1 | 準備（`ensure`） | 3 スキル共通 | （コミットなし） |
| S2 | specify（仕様作成） | speckit-feature | `docs(<FEATURE_NAME>): 仕様を作成` |
| S3 | clarify 1 回目 | speckit-feature | `docs(<FEATURE_NAME>): 仕様を明確化（1 回目）` |
| S4 | clarify 2 回目 | speckit-feature | `docs(<FEATURE_NAME>): 仕様を明確化（2 回目）` |
| S4-1 | 画面仕様（`speckit-design` §3） | speckit-feature | `docs(<FEATURE_NAME>): 画面仕様を作成` |
| S5 | plan（詳細設計） | speckit-feature | `docs(<FEATURE_NAME>): 詳細設計を作成` |
| S6 | tasks（タスク分解） | speckit-feature | `docs(<FEATURE_NAME>): タスクを分解` |
| S7-1 | analyze 1 回目 | speckit-feature | `docs(<FEATURE_NAME>): 整合性を検証（1 回目）` |
| S7-2 | analyze 2 回目 | speckit-feature | `docs(<FEATURE_NAME>): 整合性を検証（2 回目）` |
| S7-3 | analyze 3 回目 | speckit-feature | `docs(<FEATURE_NAME>): 整合性を検証（3 回目）` |
| S8 | implement（実装） | speckit-coding | `feat(<FEATURE_NAME>): タスクを実装` |
| S9 | converge（収束） | speckit-coding | `feat(<FEATURE_NAME>): 実装を仕様に収束` |
| S10 | レビュー 1 回目と修正 | speckit-coding | `fix(<FEATURE_NAME>): レビューの指摘を修正（1 回目）` |
| S11 | レビュー 2 回目と修正 | speckit-coding | `fix(<FEATURE_NAME>): レビューの指摘を修正（2 回目）` |
| S12 | 片付け（`finish`） | 3 スキル共通 | `merge(<FEATURE_NAME>): <phase>`（自動。進捗の判定に使うため、この形は変えない） |

S4-1 は後から足したステップである。S4-1 を足す前に作業を始め、S4-1 の記録なしに S5 以降へ進んだ worktree では、S4-1 は完了済みとみなされる（済んだ工程に戻らない）。画面のない機能の S4-1 は、機能の重さで扱いが変わる（下の「機能の重さ」）。重の機能では飛ばさず、`ui.md` を「UI なし」として記録する。軽・標準の機能では、画面がなければ `--skipped` で省いてよい（`ui.md` は作らない）。

### 機能の重さ

機能ファイル（`docs/feature/<FEATURE_NAME>.md`）のヘッダの `**重さ**`（`軽` / `標準` / `重`）で、工程の重さを変える。判定の規則は `speckit-concept-2-feature` の「重さ」にある（重 = データモデル・保存するデータの形、外部に公開する契約、認証と権限、お金、個人情報のどれかに触れる。軽 = 画面だけ・文言だけ・設定だけ。標準 = それ以外）。`ensure` と `state` が `WEIGHT:` で出す（欄がなければ `標準`）。ユーザーは各スキルの引数 `--weight 軽|標準|重` で上書きできる（`$HELPER` にも同じ指定を渡す）。

| 工程 | 軽 | 標準 | 重 |
|---|---|---|---|
| 質問の窓（`speckit-feature` の「質問の窓」） | 1 つ（窓 1。仕様の前） | 2 つ（窓 1、窓 2） | 2 つ |
| clarify（S3・S4） | 1 回、最大 3 問（S4 は省く） | 2 回 | 2 回 |
| 画面仕様（S4-1） | 画面があるときだけ（なければ省く） | 画面があるときだけ | 必ず（画面がなければ「UI なし」と書く） |
| analyze（S7） | 1 回（S7-2・S7-3 は省く） | 2 回（S7-3 は省く） | 3 回 |
| レビュー（S10・S11） | 1 回（S11 は省く） | 2 回。2 回目は S10 の修正の差分だけ | 2 回。2 回目もブランチ全体 |

- 省くステップは、本体を行わずに `$HELPER checkpoint <FEATURE_NAME> <step> "<subject>" --skipped "<重さ>: <理由>"` で記録する（例: `--skipped "軽: clarify は 1 回"`）。trailer `Speckit-Skipped: <step> <理由>` が付き、完了として数えるので、再開と `finish` の判定は崩れない。`status` には「（省略: S4 S7-2）」のように出る。
- 省けるステップは、軽が S4・S4-1・S7-2・S7-3・S11、標準が S4-1・S7-3、重はなし。表の外のステップを省こうとすると `$HELPER` が止まる。理由を確かめたうえで `--force` を付けたときだけ通す（自動モードでは付けない）。
- レビューで審査する軸と観点、直す指摘の数、打ち切りは `speckit-review` §2.1「予算と打ち切り」に従う。
- 回数を減らしても、最後に行う回で、省いた回の基準を満たす。analyze を省いたときは、最後の回で S7-3 の基準（CRITICAL・HIGH・MEDIUM の不整合 0 件、憲章違反 0 件、カバレッジ 100%）を確かめる。S11 を省いたときは、S10 の修正の後にテストがすべて通ることを確かめる。
- 仕様化の途中で重さの条件に当たるもの（データモデルの変更、外部に公開する契約、権限など）が出てきたら、機能ファイルの重さを上げて、以降の工程を重い方に合わせる。下げるときはユーザーに確かめる（自動モードでは下げない）。

`checkpoint` はコミットに trailer `Speckit-Step: <step>` と `Speckit-Feature: <FEATURE_NAME>` を付ける。変更がないステップも空コミットで記録する。進捗は、`main` とブランチにあるこの trailer、`main` にマージ済みの `tasks.md`、`merge(<FEATURE_NAME>): coding|all` のマージコミットから判定する。フィーチャー名付きの trailer はマージの後も残るので、競合を手で解消してマージした後に `finish` を再実行しても進捗は失われない。

`checkpoint` は、機能ファイル（`docs/feature/<FEATURE_NAME>.md`）があれば、その状態欄と `docs/feature/README.md` の一覧の状態列も更新する。S2 で `spec化済み（specs/<FEATURE_NAME>）`、S11 で `完了` にする。S11 の時点で `tasks.md` に未完了の `[人]` のタスクが残っていれば、`完了` ではなく `人の作業待ち（specs/<FEATURE_NAME>）` にする。`[後]` のタスクだけが残っていれば `完了（後の作業 N 件）` にする。

**後の段階の作業（`--phase deferred`）**: 実装まで `main` にマージ済みの機能の `[後]` のタスクを片付けるときは、S8〜S11 を同じ名前で使い、trailer `Speckit-Deferred-Step: <step>`、`Speckit-Deferred-Feature: <FEATURE_NAME>`、`Speckit-Deferred-Run: <回>` で記録する（`Speckit-Step` は使わないので、もとの機能の進捗は変わらない）。S1 は `ensure --phase deferred`、S12 は `finish --phase deferred`（件名 `merge(<FEATURE_NAME>): deferred`）。S11 は、S10 で CRITICAL・HIGH が 0 件なら重さに関わらず省ける（§3「後の段階のタスク」）。機能ファイルを手で書き換える必要はない。

## 3. 共通手順

### S1 準備

1. `$HELPER ensure <feature> --phase <phase>` を実行する。`<phase>` は、speckit-feature が `spec`、speckit-coding が `coding`、speckit-all が `all` である。
2. 終了コードが 3 のときは、§1 の表に従って案内し、そのフィーチャーの作業を止める。
3. 出力から `FEATURE_NAME`、`WORKTREE_DIR`、`NEXT_STEP`、`WEIGHT` を控える。機能ファイルに `**重さ**` がなければ（`WEIGHT` が既定の `標準` のときは、ヘッダを確かめる）、`speckit-concept-2-feature` の「重さ」の規則で判定して、worktree の機能ファイルのヘッダの末尾に書き足し、trailer なしの通常のコミットにする。`docs/feature/README.md` の一覧は変えない。以降の工程は §2「機能の重さ」の表に従う。
4. `WORKTREE_STATE` が `reused` か `reattached` のときは、まず `$HELPER resume <FEATURE_NAME>` を実行し、作業中のメモと `HANDOVER_WARN` を確かめる（§4「引き継ぎ」）。`COMPLETED_STEPS` と `NEXT_STEP` をユーザーに示し、`NEXT_STEP` から再開してよいか確認する。ユーザーが別のステップからのやり直しを指示した場合は、そのステップから進める（完了済みの記録は残したまま、成果物を更新する）。
5. `MISSING_ARTIFACTS` に `ui.md` があれば、S8 の前に `speckit-design` §3 の手順で `FEATURE_DIR/ui.md` を作る（S4-1 を足す前に仕様化した機能や、取り込む前に仕様化した機能に多い）。`validate_design.py docs/design --feature specs/<FEATURE_NAME>` のエラーを 0 件にし、trailer なしの通常のコミットにする。S4-1 は推定で済んだ扱いのままにし、`checkpoint` は記録しない。画面を作る中で `plan.md` や `tasks.md` に足りないものが見つかったら、それも直す。
6. `NEXT_STEP` が自分の担当範囲の最後より後（`S12`）なら、本体のステップを飛ばして S12 に進む。

### 各ステップの作業場所

- 以降の作業は、すべて `WORKTREE_DIR` の中で行う。コマンドは `cd "$WORKTREE_DIR"` してから実行し、ファイルは `WORKTREE_DIR` 配下のパスで読み書きする。
- `WORKTREE_DIR/.specify/feature.json` は `ensure` が `specs/<FEATURE_NAME>` を指すように書いている。speckit の各スキルやスクリプトは、この値を対象フィーチャーとして使う。
- 1 つのステップが終わったら、そのステップのチェックポイントを必ず記録する。

  ```bash
  $HELPER checkpoint <FEATURE_NAME> <step> "<§2 の subject>"
  ```

- 長いステップ（特に S8）の途中では、trailer なしの通常のコミットを作ってよい。完了の記録はステップの最後の `checkpoint` だけで行う。

### S12 片付け

1. **worktree の外に出てから**、`$HELPER finish <FEATURE_NAME> --phase <phase>` を実行する（`cd "$REPO_ROOT"`。`REPO_ROOT` は `ensure` の出力にある）。worktree の中で実行すると、スクリプトは止まる。スクリプトは次を行う。
   - 担当範囲の最終ステップ（spec は S7-3、coding と all は S11）が完了していることを確かめる。
   - coding と all では、`tasks.md` に未完了のタスクがないことを確かめる（`[人]`・`[後]` 以外があれば `UNCHECKED_TASKS` で止まる。`[人]`・`[後]` だけなら続けて、最後に `HUMAN_TASKS_PENDING`・`DEFERRED_TASKS_PENDING` を出す）。
   - 作業中のメモ（`specs/<FEATURE_NAME>/handover.md`）があれば消してコミットし、中身を `HANDOVER_REMOVED` で表示する（`main` には入れない）。
   - worktree の残りの変更をコミットする。
   - メインの作業ツリーに未コミットの変更がないことを確かめ、`main` に切り替える。
   - `git merge --no-ff -m "merge(<FEATURE_NAME>): <phase>"` でマージする。ブランチがすでにマージ済み（競合を手で解消した後など）なら、マージを飛ばして片付けだけを行う。
   - worktree とブランチを削除する。worktree にあった無視対象のファイル（`.env` など）も一緒に消えるので、出力の `REMOVED_IGNORED` に挙がったものはユーザーに知らせる。
   - クラウドセッションでは、マージ先のブランチを origin に push する（`PUSHED` など）。`PUSH_FAILED` なら、その内容をユーザーに伝える。
2. **引き継ぎの片付け**: `HANDOVER_REMOVED` が出たら、中身のうち次も効くものを `decisions.md` か `docs/pitfalls.md` に移す（移すものがなければ何もしない）。`PITFALLS_TRIAGE` が出たら、§4「引き継ぎ」の棚卸しをする。どちらも変更があれば、`main` で通常のコミットにする（例: `docs: 落とし穴を棚卸し`）。
3. マージで競合したときは、worktree とブランチが残る。競合の内容をユーザーに示し、解消方針を確認してから、メインの作業ツリーで解消してマージをコミットし、もう一度 `finish` を実行する。マージコミットのメッセージは `merge(<FEATURE_NAME>): <phase>` のままにする。

### 人のタスクの片付け

`[人]` のタスクは、マージの後に `main` で片付けてよい。規則はプロジェクトの steering（「人が行うタスク」）に従う。

1. `$HELPER human-tasks <FEATURE_NAME>` で残りを示す。
2. ユーザーが完了を伝えたら、そのタスクの「完了の確かめ方」で確かめられる部分を確かめ、`main` の `tasks.md` を `- [x]` にする。
3. `$HELPER sync-status <FEATURE_NAME>` で状態欄を合わせる。人のタスクがなくなれば `完了` になる。
4. `tasks.md` と機能ファイル、`docs/feature/README.md` の変更をまとめてコミットする（例: `docs(<FEATURE_NAME>): 人のタスクの完了を記録`）。

### 後の段階のタスク

`[後]` のタスクは、マージの後、その段階（「いつ: …」に書いたもの）が来たら片付ける。規則はプロジェクトの steering（「後の段階に回すタスク」）に従う。

1. `$HELPER deferred-tasks [<FEATURE_NAME>]` で残りを示す。
2. その段階が来たら `speckit-coding <FEATURE_NAME> --deferred [T045,T046]` で片付ける（`speckit-coding` §1「後の段階のタスク」）。実装までマージ済みの機能は `--phase coding` では `ALREADY_IMPLEMENTED` で止まるので、`--phase deferred` の専用の worktree で行う。
   - S1: `$HELPER ensure <FEATURE_NAME> --phase deferred [--tasks T045,T046]`（新しい worktree `.worktrees/<FEATURE_NAME>-deferred`、ブランチ `feature/<FEATURE_NAME>-deferred`。始めのコミットに対象と回の番号を記録する。worktree かブランチが残っていれば続きから。対象を変えるなら、今の作業を `finish` するか `abort --phase deferred` する）
   - S8〜S11: 対象のタスクだけを、S8 → S9 → S10 → S11 の順で行い、`checkpoint ... --phase deferred` で記録する
   - S12: worktree の外で `$HELPER finish <FEATURE_NAME> --phase deferred`（対象が `- [x]` でなければ止まる。機能ファイルの状態も合わせるので `sync-status` は要らない）
3. **印の扱い**: 実装したタスクは `- [x]` にし、`[後]` の印は残す（いつ後回しにしたかの記録として。`[後]` は未完了のものだけを数えるので、残しても数に入らない）。
4. **打ち切り**: 後の段階の作業は差分が小さいことが多いので、機能の重さに関わらず、S10 で CRITICAL・HIGH が 0 件なら S11 を `--skipped` で省いてよい。S8・S9・S10 は省けない。

### 一部だけを先にマージする（`--partial`）

ほかの機能の前提として、この機能の一部の Phase だけを先に `main` に入れるときに使う（steering「ほかの機能の一部だけを先に作る」）。

1. 仕様工程（S2〜S7-3）を終えておく（`--partial` でも、仕様工程の記録がなければ止まる）。
2. `speckit-coding <FEATURE_NAME> --until "Phase N"` で、`tasks.md` のその Phase までを実装し、テストを通す。S8 の `checkpoint` は記録しない（S8 はまだ終わっていない）。区切りのコミットは trailer なしで作る。
3. worktree の外で `$HELPER finish <FEATURE_NAME> --phase coding --partial` を実行する（`speckit-all` の worktree なら `--phase all --partial`）。件名は `merge(<FEATURE_NAME>): partial` で、進捗の判定には使わない。未完了のタスクの検査はしない。
4. 残りは、後で `speckit-coding <FEATURE_NAME>` を実行すれば、`main` から新しい worktree を作って S8 から続ける（済んだタスクは `- [x]` のまま）。

### 中止

`$HELPER abort <FEATURE_NAME>`（後の段階の作業なら `--phase deferred` を付ける）で削除対象を表示し、ユーザーの明示的な同意を得てから `--yes` を付けて実行する。ユーザーの指示なしに中止してはならない。

## 4. 共通規則

- **対話的な確認**: 仕様の曖昧さ、設計判断、実装方針の分岐、レビュー指摘の修正方針など、ユーザーの判断が必要な事項は、推奨案（`**Recommended:**`）を添えて質問し、合意を得てから進める。引数に `--auto` があるときは、質問せずに §6 の自動モードで進める（各スキル本文の 💬 の質問と、標準スキルの確認も含む）。
- **質問はまとめる**: 質問はステップごとに出さない。仕様工程の質問は `speckit-feature` の「質問の窓」（仕様の前と計画の前。1 つの窓で最大 3 回、1 回に最大 4 問）に集める。それ以外で推奨案で決めたことは `FEATURE_DIR/decisions.md` に集め、S8 の終わりに 1 回で確かめる（件数の上限なし。`speckit-coding` の S8）。窓の外で止めて聞いてよいのは、待つと作業が無駄になる前提の誤り（作る対象の取り違え、憲章・`docs/architecture.md`・`docs/nfr.md` の変更が要るもの）だけである。
- **破壊的コマンドの禁止**: `rm -rf`、`git reset --hard`、`git clean -f`、`git push --force` などの破壊的コマンドは使わない。worktree とブランチの操作は `$HELPER` だけで行う。
- **言語**: 応答と成果物は、プロジェクトの言語ルール（`.kiro/steering/language.md` など）に従う。ルールがない場合も日本語で書く。
- **テスト・ビルド・リンター**: 実行するコマンドは、下の「開発コマンド」の正本（`$HELPER commands get <key>`）を使う。記録がなければ、`plan.md` の技術コンテキスト、`quickstart.md`、プロジェクトの設定ファイル（`package.json`、`Makefile`、`pyproject.toml` など）から判断し、決まったら `$HELPER commands set` で記録する。判断できない場合はユーザーに確認する。

### 開発コマンド

テスト、リンター、ビルドなどのコマンドは、`.specify/commands.json` を正本にする。機能ごとの `plan.md` や `quickstart.md` に書き散らすと、どれが今のコマンドか分からなくなるためである。

| キー | 用途 |
|---|---|
| `test` | 単体テストと結合テスト（S8〜S11 の検証で必ず通す） |
| `lint` | リンターとフォーマットの確認 |
| `typecheck` | 型の検査（使わない言語では空文字） |
| `build` | ビルド |
| `e2e` | E2E テスト（あれば） |
| `dev` | 手で確かめるときの起動（開発サーバーなど） |

- 読むときは `$HELPER commands get <key>`、記録するときは `$HELPER commands set <key> '<command>'` を使い、JSON を手で書かない。使わないものは空文字（`''`）で記録する。上の表にない名前も記録できる。
- 最初に記録するのは、プロジェクトの土台を作る機能（多くは `000-app-basic`）の S5（計画で決めたとき）か S8（実際に動かしたとき）である。worktree の中で記録すると、その機能と一緒にマージされる。
- 機能の計画で、コマンドを足したり変えたりするとき（テストの道具を変える、E2E を足すなど）は、同じ機能の中で `commands set` で正本を直す。`plan.md` の技術コンテキストには、キーの名前と正本のコマンドを同じに書く。食い違ったら正本を信じ、`plan.md` を直す。
- コマンドはプロジェクトのルートで実行する。worktree の中ではその worktree のルートで実行する。

### 診断

`$HELPER doctor` は、作業を始める前に環境と設定を確かめる。立ち上げの最後（`speckit-bootstrap` の B6）、既存のプロジェクトへの取り込みの後、「動かない」と言われたときに使う。

| 項目 | ERROR | WARN |
|---|---|---|
| Python | 3.9 より古い | — |
| マージ先のブランチ | ない（`SPECKIT_MAIN_BRANCH` を確かめる） | — |
| `.gitignore` | `.worktrees/` を無視していない | — |
| 開発コマンド | `.specify/commands.json` を読めない | ファイルがない、`test`・`lint`・`typecheck` が記録されていない、先頭のプログラムが PATH にない |
| スキル | `.claude/skills`・`.agents/skills`・`.kiro/skills` がない、リンクが切れている、`speckit-worktree`・`speckit-specify` がない | — |
| Spec Kit と憲章 | `.specify/` がない | 憲章がない、テンプレートのまま |
| steering と入口 | steering の 2 ファイルがない | `CLAUDE.md`・`AGENTS.md`・`GEMINI.md` がない、steering を読み込んでいない |

WARN は、工程の途中では正常なこともある（例: 最初の機能の前は開発コマンドがない）。ERROR は直す。リンクが切れているときは、`new-speckit-project update` を実行し直す。コマンドのプログラムが PATH にないときは、インストールの手順を示すか、パスを直して `commands set` で記録し直す。
- **コマンドの書き方**: speckit のスキル本文にある `$speckit-plan` のようなコマンド参照は、実行中のエージェントの呼び出し方に読み替える。

### 親と担当の役割

サブエージェント（Claude Code の Agent など）が使えるときは、実行中のエージェント（親）は指揮と裏取りに回り、量の多い作業を担当（サブエージェント）に任せる。1 人で全部を抱えると、文脈が足りなくなる。依頼文の雛形は [references/delegation.md](references/delegation.md) にある。

| 役割 | 親が持つ | 担当に任せる |
|---|---|---|
| ユーザーとのやりとり | 質問（質問の窓、S8 の終わりの確認）、採否の判断、完了報告 | — |
| 進捗と git | `checkpoint`、`finish`（マージ）、push、`--skipped` の判断 | 区切りの通常のコミット（trailer なし） |
| 作業 | 仕様工程の成果物（S2〜S7。量が多ければ下書きを任せてよい） | S8（Phase ごとに分ける）、S9、軸ごとのレビュー（`speckit-review` §3.1）、指摘の修正 |
| 検証 | 担当の報告の後に、テスト・リンター・ビルド・`validate_design.py` を自分で再実行する | 自分の作業の範囲の検証 |

- 担当にさせないこと: `checkpoint`、マージ、push、ユーザーへの質問、ほかの担当の範囲の編集、破壊的な git の操作。担当が判断に迷ったら、推奨案で進めて `decisions.md` に書かせ、親がまとめて確かめる（§4「質問はまとめる」）。
- 並行に走らせるのは、ファイルが重ならない作業だけにする（レビューの軸どうしは並行してよい。S8 の Phase は依存があるので順に）。
- サブエージェントがない環境では、親が同じ順で自分で行う。役割の区切り（報告の形、検証の再実行）は同じにする。
- 自動モードでも同じに分ける。担当が自動で決めたことは、担当の報告から親が `auto-decisions.md` に記録する。

### 文脈の節約

- 親は差分そのものを読まず、担当の報告（件数、決めたこと、検証の結果）と、自分で再実行した検証の結果を見る。報告に疑問があるときだけ、該当するファイルの行を開いて裏を取る。
- 大きなステップ（とくに S8）は Phase の境目でコミットさせ、次の担当には「前の担当のコミット」と「決めたことの台帳（`decisions.md`）」だけを渡す。
- レビューの記録は `FEATURE_DIR/reviews/review-<回>.md` に残し、2 回目の担当にはそのパスを渡す（親の会話に指摘の全文を持たない）。
- 会話が長くなったら、ステップの境目（`checkpoint` の直後）で区切り、新しいセッションで同じスキルを実行して再開する。進捗はコミットに記録されているので、`NEXT_STEP` から続けられる。区切るときは、下の「引き継ぎ」の作業中のメモを書く。

### 引き継ぎ

引き継ぎの文書は、正本の写しになると更新漏れで食い違い、増え続けると読む手間とノイズになる。そこで、**導けるものは書かない**、**書くものには寿命を付けて仕組みで消す**、**次も効く知見は正本に移す**、の 3 つを守る。

| 中身 | 置き場所 | 消すとき |
|---|---|---|
| 進捗の要約（次のステップ、`[人]`・`[後]`、確かめていない判断、`（仮）`、backlog） | ファイルにしない。`$HELPER resume` が正本（trailer、`tasks.md`、`decisions.md`、`spec.md`）から生成する | — |
| 作業中のメモ（止めた理由、次の一手、試して駄目だったこと） | `specs/<FEATURE_NAME>/handover.md`（feature ブランチだけ。様式: [templates/handover.md](templates/handover.md)） | `finish` がマージの前に自動で消す（`main` に入らない） |
| 落とし穴（次の機能でも踏みそうな罠） | `docs/pitfalls.md`（受け箱。様式: [templates/pitfalls.md](templates/pitfalls.md)） | 上限を超えたら棚卸しで、正本に移すか消す |
| セッションの履歴、プロジェクト全体の申し送り | 作らない。履歴は `git log` と trailer、申し送りは既存の置き場所（判断待ちは `decisions.md`・`auto-decisions.md`、人の作業は `[人]`、後の作業は `[後]`、細かい改善は `reviews/backlog.md`） | — |

**作業中のメモ**:

- 書くのは、セッションを区切るとき（`checkpoint` の直後）に、親だけである。担当には書かせない。
- 様式は「止めた理由」「次の一手」「試して駄目だったこと」の 3 節だけで、進捗やタスクの一覧は書かない。毎回上書きし、追記しない。30 行まで。
- 冒頭に `基準コミット: <hash>`（書いた時点の HEAD）を書き、通常のコミットにする。`resume` は、その後に作業のコミットがあれば「メモが古い」と警告する（`HANDOVER_WARN`）。警告が出たら、メモより正本を信じ、メモを書き直すか消す。
- セッションを始めるとき（再開するとき）は、まず `$HELPER resume <FEATURE_NAME>` を読む。
- クラウドセッションでは、feature ブランチを push できないので、VM が回収されるとメモも失われる（1 つのフィーチャーを 1 つのセッションで `finish` まで進める規則のため、実害は小さい）。

**落とし穴の受け箱**:

- 1 件ごとに、日付（**記録**）、症状、原因、避け方、**昇格先の候補**（steering の節、`docs/architecture.md`、`quickstart.md`、テストやリンターの追加など）を書く。新しいものを上に書く。
- 上限は 10 件。記録から（据え置いたものは据え置きから）3 機能を `main` にマージしたら、`status` と `finish` が `PITFALLS_TRIAGE` で棚卸しを求める。
- 棚卸しでは、各項目を **昇格**（正本に移して受け箱から消す）、**削除**（もう起きない）、**据え置き**（`- **据え置き**: <日付> <理由>` を足す。1 回まで）のどれかにする。項目がなくなったら、ファイルごと消す。
- 自動モードでも棚卸しは行う。昇格先が憲章・`docs/architecture.md`・`docs/nfr.md` の変更になるものは自動で変えず、据え置きにして `auto-decisions.md` に記録する。

## 5. 引数の解釈と複数フィーチャーの進め方

| 指定 | 例 | 動作 |
|---|---|---|
| 単一 | `1`、`002`、`002-auth`、`auth` | `$HELPER resolve` で 1 件に決める |
| 範囲 | `002-005`、`002..005` | `$HELPER list` の結果から番号が範囲内のものを番号順に選ぶ |
| 全件 | `all` | `$HELPER next --phase <phase>` を、空になるまで繰り返す |
| なし | （空） | `$HELPER next --phase <phase>` の 1 件。空なら対象なしと報告する |
| 自動モード | `--auto`、`002-005 --auto`、`--auto all` | 上のいずれかと組み合わせる。質問せずに推奨案を採用して進める（§6） |
| モックを作る | `--with-mock`、`002 --with-mock --auto` | 上のいずれかと組み合わせる。S4-1 で、Claude Design のモックを作って案を選ぶ（`speckit-design` §4）。付けなければテキストの画面仕様だけを作る |
| 重さの上書き | `--weight 軽`、`002 --weight 重` | 上のいずれかと組み合わせる。機能ファイルの `**重さ**` の代わりに、指定した重さで工程を進める（§2「機能の重さ」）。範囲指定や `all` では、対象のすべてのフィーチャーに効く |

- `--auto` と `--with-mock` は位置を問わない。フィーチャーの指定を解釈する前に取り除き、`$HELPER` には渡さない。`--weight <値>` も位置を問わず取り除き、`$HELPER` の `ensure`・`state`・`checkpoint` に同じ指定を渡す。
- 一覧にない新しいフィーチャーは、`001-short-name` の形の完全名で指定する。
- 複数のフィーチャーは 1 件ずつ直列に進める。前のフィーチャーの S12（マージ）が終わってから、次のフィーチャーの S1 に進む。後続のフィーチャーは、先行フィーチャーの成果を含む最新の `main` から分岐する。
- 範囲指定の途中で `ALREADY_SPECIFIED` や `ALREADY_IMPLEMENTED` になったフィーチャーは、飛ばしたことを記録して次に進む。それ以外の理由で止まったときは、飛ばして続けるか中断するかをユーザーに確認する（自動モードでは確認せずに飛ばす。§6「止まったときの扱い」）。
- `all` で飛ばしたフィーチャーは、以降の `next` に `--skip <飛ばしたもの,...>` を付けて除く（付けないと、途中の worktree が残っているフィーチャーがまた選ばれる）。

## 6. 自動モード（`--auto`）

引数に `--auto` があるときは、ユーザーに質問せず、エージェント自身が示す推奨案を採用して進める。範囲指定や `all` と組み合わせて、無人で続けて流す使い方を想定する。

仕様駆動開発の「曖昧さを推測で埋めない」に反しないよう、自動で決めたことはすべて推奨案として明示し、後から見直せる形で記録する（下の「記録」）。安全規則（§4 の破壊的コマンドの禁止など）は、自動モードでも変わらない。

### 推奨案を自動で採用する場面

| 場面 | 自動モードでの動作 |
|---|---|
| S1 の再開確認（`WORKTREE_STATE` が `reused` / `reattached`） | `NEXT_STEP` から再開する |
| S1 で機能ファイルに `**重さ**` がない | 「重さ」の規則で判定して書き足す。迷ったら重い方にする |
| 質問の窓（`speckit-feature`）と S8 の終わりの確認（`speckit-coding`） | 開かない。窓で聞くはずだった論点は、下の各行のとおり推奨案を採用する。`decisions.md` に残っている行は「自動で採用」にする |
| S2〜S4 の前提条件・スコープの疑問、clarify の質問 | 推奨案（`**Recommended:**`）を回答として採用する。推奨案を 1 つに絞れない論点は、範囲が狭く後から広げやすい選択肢を採る |
| S4-1 の画面の構成、`--with-mock` の案の選択 | 推奨案を採用する（`speckit-design` §6）。既存のトークンや共通の決め事を変える必要があるときは止まる |
| S5 のアーキテクチャのトレードオフ、ライブラリの選定 | 推奨案を採用し、`research.md` に Decision・Rationale・Alternatives considered を残す。`docs/architecture.md` と `docs/nfr.md` から外れる選択はしない |
| S7 の修正方針、`speckit-analyze` の「修正案を示しますか」 | 「はい」とみなし、推奨の修正を当てる |
| S8 の `speckit-implement` の「チェックリストに未完了の項目があるが続けるか」 | 続行する。未完了の項目を完了報告に挙げる |
| S8〜S11 の実装方針の分岐、ギャップの解消方針、レビュー指摘の対応方針 | 推奨案を採用する。仕様を変える場合は、コードだけでなく `spec.md`、`plan.md`、`tasks.md` にも反映する |
| `LEFTOVER_CHANGES` | worktree の変更はこのフィーチャーの作業で生じたものなので、`--commit-leftovers` を付けて `finish` を再実行する。含めた変更の一覧を完了報告に挙げる |
| `UNCHECKED_TASKS` | 未完了のタスクを S8 の手順で実装し、テストが通ったら `finish` を再実行する（`--allow-unchecked` は自動で付けない） |
| S8 の `[人]` のタスク | 実行せず、`[x]` にもしない。手順を示して保留にし、依存しない後続のタスクを続ける。保留にしたタスクを完了報告に挙げる |
| S8 の `[後]` のタスク | 実行しない。後の段階で `--deferred` で片付ける |
| `HUMAN_TASKS_PENDING` | マージは済んでいる。残りの `[人]` のタスクを完了報告に挙げる（自動で完了にしない） |
| `DEFERRED_TASKS_PENDING` | マージは済んでいる。残りの `[後]` のタスクと、それぞれの「いつ」を完了報告に挙げる |

### 自動モードでも止まる場面

次の場面は、推奨案を選んでも取り返しがつかないか、推測で進めると危険なので、自動では進めない。

- `finish` でのマージの競合（自動で解消しない）
- 中止（`abort`）。ユーザーの明示的な同意が必要である
- `NOT_ON_MAIN`（メインの作業ツリーのブランチを自動で切り替えない）
- `UNCHECKED_TASKS` で、未完了のタスクを実装しても残る場合
- テスト・ビルド・リンターのコマンドが §4 の情報源から判断できない場合
- テストやビルドの失敗が、同じ原因に対して 3 回直しても解消しない場合
- S11（軽の機能では S10）で、CRITICAL か HIGH の指摘を直した後の確かめでも、CRITICAL か HIGH が残る場合（`speckit-review` §2.1「回数と打ち切り」）
- S2 で、機能概要も追加指示もなく、何を作るかが決められない場合
- 憲章、`docs/architecture.md`、`docs/nfr.md` の変更が必要になった場合（これらの改訂は自動で行わない）
- S4-1 で、`docs/design/` の既存のトークンや共通の決め事の変更が必要になった場合（足すことは自動で行ってよい）

### 止まったときの扱い

1. worktree とブランチはそのまま残し、止まった理由、止まったステップ、ユーザーに判断してほしい事項（選択肢と推奨案）を記録する。
2. 単一のフィーチャーの指定なら、完了報告を出して終了する。
3. 範囲指定や `all` なら、そのフィーチャーを飛ばして次に進む（`all` では `next` の `--skip` に加える）。後続のフィーチャーの機能概要の `**依存**` に、飛ばしたフィーチャーが含まれる場合は、そのフィーチャーも飛ばす。
4. 止まったフィーチャーは、ユーザーが判断した後に、同じスキルをもう一度実行すれば（`--auto` の有無を問わない）続きのステップから再開できる。

### 記録

- **clarify（S3、S4）**: 見出しを `### Session YYYY-MM-DD (Round 1, auto)` のようにし、自動で採用した回答の行末に `(auto)` を付ける。
- **自動判断の一覧**: 自動で採用したすべての判断を `FEATURE_DIR/auto-decisions.md` に追記する。1 件ごとにステップ、論点、選択肢、採用した案、理由、反映したファイルを書く。clarify の回答もここに併記する。
- **完了報告**: 各スキルの完了報告に、`auto-decisions.md` の要約（見直しを勧める判断を先に）と、止まったフィーチャーとその理由、ユーザーに判断してほしい事項を加える。見直すときは `speckit-clarify` や該当するスキルを案内する。

## 7. 手動での利用

ユーザーからこのスキルを直接呼ばれたときは、引数に応じて次を行う。

- `doctor`: 結果を表示し、ERROR と、今の工程で直すべき WARN の直し方を案内する。
- `commands [...]`: 結果を表示する。`set` と `unset` の後は、変更をコミットするかをユーザーに確かめる（worktree の中なら、そのステップのコミットに含めてよい）。
- `resume <feature>`: 結果を表示し、`HANDOVER_WARN` があれば、メモより正本を信じるよう添える。
- `pitfalls`: 結果を表示し、棚卸しが要るものは §4「引き継ぎ」の手順で片付ける。
- `status`（または引数なし）: `$HELPER status` の結果を表示し、途中の worktree があれば再開に使うスキルを案内する。人の作業が残っているフィーチャーがあれば、`human-tasks` での確認を案内する。
- `human-tasks [<feature>]`: 結果を表示する。
- `deferred-tasks [<feature>]`: 結果を表示し、それぞれの「いつ」を示す。その段階が来たものは `speckit-coding <feature> --deferred` を案内する。
- `sync-status <feature>`: §3「人のタスクの片付け」の手順に従う。
- `next --phase <phase>`: 結果を表示する。
- `abort <feature>`: §3「中止」の手順に従う。
