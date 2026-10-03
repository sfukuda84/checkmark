---
inclusion: always
---

# 仕様駆動開発ルール（Spec Kit）

このプロジェクトは [GitHub Spec Kit](https://github.com/github/spec-kit) による **仕様駆動開発（Spec-Driven Development）** で進める。コードは仕様から導くものであり、仕様を経ずに機能を実装しない。

## 基本原則

1. **仕様が先、コードが後**: 新機能や振る舞いの変更は、必ず `spec.md` → `plan.md` → `tasks.md` の順に成果物を作ってから実装する。
2. **憲章（constitution）が最上位**: `.specify/memory/constitution.md` をすべての判断の基準とする。計画や実装が憲章と矛盾する場合は、先に憲章との整合を取る。
3. **仕様は「何を・なぜ」、計画は「どう作るか」**: `spec.md` には技術スタックや実装詳細を書かず、ユーザー価値と要件に集中する。技術的な選択は `plan.md` に書く。
4. **曖昧さは推測で埋めない**: 不明点は `[NEEDS CLARIFICATION: ...]` として明示し、`/speckit-clarify` やユーザーへの確認で解消する。`speckit-feature`・`speckit-coding`・`speckit-all` の自動モード（`--auto`）と、`speckit-bootstrap` の自動モード（`--auto`、`--oneshot`）では、推奨案を明示して採用し、`auto-decisions.md` に記録することで確認に代える（`speckit-worktree` の §6、`speckit-bootstrap` の §7）。対話で進めるときも、質問の窓に入りきらない論点は推奨案を明示して仮に採り、`decisions.md` に記録して S8 の終わりにまとめて確かめる（`speckit-worktree` の §4「質問はまとめる」）。
5. **成果物と実装を同期させる**: 実装中に仕様の誤りや不足が見つかったら、コードだけを直さず `spec.md` / `plan.md` / `tasks.md` にも反映する。
6. **アーキテクチャと非機能要件とデザインに従う**: 各機能の `plan.md` は `docs/architecture.md`（構成と技術スタック）と `docs/nfr.md`（全機能が守る非機能要件）に従う。画面のある機能は、`docs/design/`（デザインの共通の決め事）に従い、`plan.md` の前に画面仕様 `ui.md` を作る。これらと違う技術や目標が必要になった場合は、`plan.md` で独自に決めず、`speckit-architecture`、`speckit-nfr-feature`、`speckit-design` の更新モードで先に見直す。

## 標準ワークフロー

| 手順 | コマンド | 成果物 | 目的 |
|---|---|---|---|
| 0 | `speckit-constitution` | `.specify/memory/constitution.md` | プロジェクトの原則を定める（初回と改訂時） |
| 1 | `speckit-specify` | `specs/<NNN-name>/spec.md` | 自然言語の要求から仕様を作る |
| 2 | `speckit-clarify` | `spec.md`（更新） | 曖昧な点を質問して仕様に反映する（推奨） |
| 3 | `speckit-plan` | `plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md` | 技術的な設計と実装計画を作る |
| 4 | `speckit-checklist` | `checklists/*.md` | 要件の品質を確認するチェックリストを作る（任意） |
| 5 | `speckit-tasks` | `tasks.md` | 依存順に並べた実装タスクを作る |
| 6 | `speckit-analyze` | 分析レポート（非破壊） | spec / plan / tasks の整合性を検査する（推奨） |
| 7 | `speckit-implement` | ソースコード、`tasks.md`（進捗更新） | タスクに従って実装する |
| 8 | `speckit-converge` | `tasks.md`（追記） | 実装と仕様の差分を洗い出し、残作業をタスクに加える |
| - | `speckit-taskstoissues` | GitHub Issues | タスクを Issue に変換する（任意） |

コマンドの呼び出し方はエージェントごとに異なる。

| エージェント | コマンド定義の場所 | 呼び出し例 |
|---|---|---|
| Claude Code | `.claude/skills/speckit-*/` | `/speckit-specify <要求>` |
| Codex CLI | `.agents/skills/speckit-*/` | `$speckit-specify <要求>` |
| Antigravity (agy) | `.agents/skills/speckit-*/` | `/speckit-specify <要求>` |
| Kiro CLI | `.kiro/skills/speckit-*/` | スキル `speckit-specify` を指定して依頼する |
| opencode | `.opencode/commands/speckit.*.md` | `/speckit.specify <要求>` |

`.claude/skills/`、`.agents/skills/`、`.kiro/skills/` の各 `speckit-*` は、プロジェクト内の共有スキル `skills/speckit/` への相対シンボリックリンクであり、全エージェントが同じスキル定義を使う。

スキルの本文にある `AskUserQuestion`（選択肢付きの質問）、`WebSearch` / `WebFetch`（Web 検索とページの取得）、Agent（サブエージェント）は Claude Code のツール名である。ほかのエージェントでは、同じ働きのツールを使う。質問のツールがなければ、選択肢と推奨案を文章で示してユーザーの回答を待つ。Web を調べられない環境では、推測で埋めずに、調査が必要な項目と理由をユーザーに伝える。

共有スキルは Codex 向けに生成されているため、スキル本文中のコマンド参照は `$speckit-plan` のような Codex の書き方になっている。ユーザーに次のコマンドを提示するときは、上の表に従って自分のエージェントの呼び出し方に読み替える（例: Claude Code と Antigravity では `/speckit-plan`、Kiro CLI ではスキル名 `speckit-plan`、opencode では `/speckit.plan`）。

### 追加スキル

新規プロジェクトの立ち上げでは、`speckit-bootstrap` が次の順にスキルを実行する: `speckit-concept-2-feature` → `speckit-architecture` → `speckit-constitution` → `speckit-common-feature` → `speckit-nfr-feature` → `speckit-design` → 検証。

| スキル | 目的 |
|---|---|
| `speckit-bootstrap` | 新規プロジェクトの立ち上げ（上の順）を通しで行う。ステップごとにコミットし、中断しても続きから再開できる。`--auto` で質問なし、`--oneshot` で最初に一度だけ質問して進める。`--adopt` で既存のプロジェクトの資料とコードから成果物を移し替える |
| `speckit-architecture` | 機能一覧を実現するアーキテクチャと技術スタックを、SaaS/PaaS・クラウド・VPS の 3 系統の比較から選び、`docs/architecture.md` に書く |
| `speckit-common-feature` | 認証やメール送信など、コアドメイン以外の共通機能を `docs/feature/000-app-basic.md` に定義する |
| `speckit-nfr-feature` | 全機能が守る非機能要件を `docs/nfr.md` に、監視・バックアップ・CI/CD などの運用基盤を `docs/feature/999-app-nfr.md` に定義する |
| `speckit-design` | デザインの共通の決め事（見た目の `DESIGN.md`、振る舞いの `EXPERIENCE.md`、DTCG 形式のトークン）を `docs/design/` に定義し、機能ごとの画面仕様（`specs/<NNN-name>/ui.md`）の書き方を定める。`--with-mock` で Claude Design のモックも作る |
| `speckit-project` | 市場規模、価格と収支計画、KPI、スケジュール、体制、リスクをヒアリングと出典付きの調査で決め、事業計画の正本 `docs/project.md` に書く。収支は `plan.py` で計算する（立ち上げの後に任意で実行する） |
| `speckit-presentation` | `docs/project.md` などの成果物から、読み手（社内の承認・投資家・顧客）に合わせた企画書を `docs/presentation/<読み手>/` に作る。内容は `slides.md`、見た目は `design.yaml` に書き、`build_pptx.py` で pptx にする（pptx は手で直さない） |
| `speckit-concept-2-feature` | `docs/concept/` のコアコンセプトを、`speckit-specify` に渡せる単位の機能概要（`docs/feature/`）と着手順序（`spec_order.md`）に仕分ける |
| `speckit-feature` | 仕様工程。worktree で specify・clarify ×2・画面仕様・plan・tasks・analyze ×3 を行い、`main` にマージする。`--with-mock` で画面仕様のモックも作る |
| `speckit-coding` | 実装工程。worktree で implement・converge・レビュー ×2 を行い、`main` にマージする |
| `speckit-all` | `speckit-feature` と `speckit-coding` を 1 つの worktree で通して行い、最後に `main` にマージする |
| `speckit-worktree` | 上の 3 スキルが使う worktree 管理と共通の実行規則。進捗の確認（`status`）、残っている人のタスクの確認（`human-tasks`）、状態の同期（`sync-status`）、中止（`abort`）にも使う |
| `speckit-review` | Standards 軸と Spec 軸の 2 軸でコード変更をレビューする |

`speckit-feature`、`speckit-coding`、`speckit-all` の質問は、ステップごとに出さず、仕様の前と計画の前の「質問の窓」（1 つの窓で最大 3 回、1 回に最大 4 問）と、S8 の終わりの 1 回の確認（`decisions.md`。件数の上限なし）にまとめる（`speckit-worktree` の §4「質問はまとめる」）。

サブエージェントが使えるときは、実行中のエージェント（親）は指揮と裏取り（ユーザーへの質問、採否、`checkpoint`、マージと push、検証の再実行）を持ち、量の多い作業（S8 の Phase、S9、軸ごとのレビュー、指摘の修正）を担当に任せる。担当には `checkpoint`・マージ・push・ユーザーへの質問をさせない。親は差分を読まず、担当の報告と自分で再実行した検証の結果を見る（`speckit-worktree` の §4「親と担当の役割」「文脈の節約」、依頼文の雛形は `speckit-worktree/references/delegation.md`）。

テスト・リンター・ビルドなどの開発コマンドは `.specify/commands.json` を正本にし、`worktree_helper.py commands get|set` で読み書きする。環境と設定の診断は `worktree_helper.py doctor` で行う（`speckit-worktree` の §4「開発コマンド」「診断」）。

引き継ぎの文書は、正本の写しにしない。進捗の要約は `worktree_helper.py resume` が正本から生成する。手で書くのは、feature ブランチだけに置く作業中のメモ（`specs/<NNN-name>/handover.md`。`finish` が消す）と、落とし穴の受け箱（`docs/pitfalls.md`。10 件・3 機能で棚卸しし、正本に移すか消す）だけにする（`speckit-worktree` の §4「引き継ぎ」）。

各機能の工程の重さは、機能ファイルのヘッダの `**重さ**`（`軽` / `標準` / `重`）で変わる。データモデル・外部に公開する契約・認証と権限・お金・個人情報に触れる機能は `重` にし、clarify・analyze・レビューを省かない。画面だけ・文言だけ・設定だけの機能は `軽` にし、回数を減らす。省いたステップも記録する（`speckit-worktree` の §2「機能の重さ」）。

`speckit-feature`、`speckit-coding`、`speckit-all` は、フィーチャーごとに `.worktrees/<NNN-name>`（ブランチ `feature/<NNN-name>`）で作業し、ステップごとにコミットして進捗を記録する。中断しても、どのスキルからでも続きのステップから再開できる。worktree で作業している間は、Spec Kit のスキルが「リポジトリのルート（repo root）」と書いている箇所を worktree のディレクトリに読み替える。既定のブランチが `main` 以外なら、環境変数 `SPECKIT_MAIN_BRANCH` にその名前を指定する。Claude Code のクラウドセッションでは、マージ先がセッションの作業ブランチになる（下の「Claude Code のクラウドセッション」）。

### 既存のプロジェクトへの取り込み

speckit を使っていなかった既存のプロジェクトには、`new-speckit-project adopt <プロジェクト>` で scaffold の持ち物（スキル、Spec Kit、ルール）を取り込み、`speckit-bootstrap --adopt` で既存の資料とコードから成果物を作る（`speckit-bootstrap` の §8）。

- **既存のものを壊さない**: 取り込み前からあるファイル（`CLAUDE.md`、`README.md`、設計書、コード）は上書き・移動・削除しない。`adopt` は、中身の違う scaffold のファイルを `.scaffold-new/` に置くだけにする。
- **既存の判断を採る**: 言語、フレームワーク、DB、デプロイ先など、既存のコードで決まっていることは、推奨と違っても既存を採る。変えた方がよい点は「見直しの候補」として記録するだけにする。
- **実装済みの機能**: 機能ファイルの状態を `実装済み（spec なし）` か `一部実装（spec なし）` にし、「現状の実装」節を書く。仕様を作るときは、既存のコードを踏まえる。
- **取り込む前に仕様化した機能**: 画面仕様（`ui.md`）がないことがある。`speckit-coding`・`speckit-all` の S1 で `MISSING_ARTIFACTS: ui.md` が出たら、S8 の前に作る（`speckit-worktree` §3「S1 準備」）。
- **取り込みの計画**: `docs/adopt-plan.md` に、ステップごとの扱い（移し替える / 完了として記録 / 新しく作る / 飛ばす）を書く。

## エージェントの行動規範

- ユーザーが機能追加や変更を依頼し、対応する `specs/` のフィーチャーがまだない場合は、いきなり実装せず、まず `speckit-specify` から始めることを提案する。
- 各コマンドは前の手順の成果物を前提とする。前提の成果物がない場合は、欠けている手順を案内する。
- `tasks.md` の完了したタスクは `- [x]` に更新し、進捗と実態を一致させる。
- 1 つの手順が終わったら結果を要約し、次に実行すべきコマンドを提示する。
- 誤字修正、依存関係の更新、設定の微調整など、振る舞いを変えない軽微な変更は仕様化を省略してよい。判断に迷ったらユーザーに確認する。
- Spec Kit とスキルのスクリプトは Python（3.9 以上）で書かれており、`python3 <スクリプト>` の形で呼ぶ。`python3` というコマンドがない環境（Windows など）では、`python` または `py -3` に読み替えて実行する。

### 人が行うタスク（`[人]`）

`tasks.md` のタスクは AI が実行するものを基本とし、AI が実行できない、または実行すべきでないタスクにだけ `[人]` を付ける。タスクの書式は Spec Kit のテンプレートのままで、印を足すだけである。

- `[人]` の対象は、契約や支払い、アカウントの作成、秘密情報の入力、外部サービスの管理画面での操作、実機での確認、社外とのやり取り、公開やリリースの判断など、人の権限や判断が要る作業である。
- 印の位置は `[Story]` の後に固定する（例: `- [ ] T001 [P] [US1] [人] 本番のドメインを取得し、DNS を設定する（完了の確かめ方: T002 が通る）`）。印のないタスクは AI が行う。
- 人と AI が混ざる作業は、2 つのタスクに分ける。人が操作した結果を AI が確かめる場合は、確かめる側を AI のタスクにする。
- `[人]` のタスクには、末尾に「（完了の確かめ方: …）」を書く。確認用のコマンドの出力、手順書の記録、後続の AI のタスクが通ることなど、完了を後から確かめられる方法にする。
- `speckit-tasks` は、上の対象に当たる作業に `[人]` を付けて分ける。
- `speckit-implement` は `[人]` のタスクを実行しない。手順を示して保留にし、依存しない後続のタスクを続ける。保留にしたタスクは完了報告に挙げる。
- `[人]` のタスクは、ユーザーが完了を伝え、「完了の確かめ方」で確かめられる部分を AI が確かめてから `- [x]` にする。自動モード（`--auto`）でも、`[人]` のタスクを自動で `- [x]` にしない。
- `speckit-converge`、`speckit-analyze`、`speckit-review` は、未完了の `[人]` のタスクを実装漏れや不整合として扱わない。そのタスクと重なる新しいタスクも足さない。
- `[人]` のタスクだけが残ったフィーチャーは、`speckit-coding` と `speckit-all` の最後に `main` にマージしてよい。機能ファイルの状態は `人の作業待ち` になる。残りは `main` で片付け、`speckit-worktree` の `sync-status` で状態を `完了` にする（`speckit-worktree` の §3「人のタスクの片付け」）。
- AI は、秘密情報の値を読んだり出力したりしない。設定を確かめるときは、値が設定されているかどうかだけを見る。

### 後の段階に回すタスク（`[後]`）

MVP に要らない分や、ほかの機能の実装を待つ分など、**この機能のマージの後に、別の段階で行うと決めたタスク**には `[後]` を付ける。書式は `[人]` と同じで、印は `[Story]` の後に置き、末尾に「（いつ: 公開時 / 003 の前 / 001 の実装の後 など）」を書く（例: `- [ ] T045 [US2] [後] 本番の監視の通知先を足す（いつ: 公開時）`）。

- `[後]` にするのは、仕様（`spec.md` の Assumptions や Clarifications）で段階を分けると決めたタスクだけである。実装が間に合わなかったタスクを `[後]` にしない（その場合は `finish` の `--allow-unchecked` の確認を経る）。
- `speckit-tasks` は、仕様で後の段階に回すと決めた作業に `[後]` を付けて分ける。`speckit-implement` は `[後]` のタスクを実行しない。
- `speckit-worktree` の `finish` は、未完了が `[人]`・`[後]` だけなら止めずにマージし、`DEFERRED_TASKS_PENDING` で残りを示す。機能ファイルの状態は `完了（後の作業 N 件）` になる（`[人]` が残れば `人の作業待ち`）。
- `speckit-converge`、`speckit-analyze`、`speckit-review` は、未完了の `[後]` のタスクを実装漏れや不整合として扱わない。そのタスクと重なる新しいタスクも足さない。
- 残りは `speckit-worktree` の `deferred-tasks` で確かめ、その段階が来たら `speckit-coding <機能> --deferred [T045,T046]` で片付ける。専用の worktree（`.worktrees/<機能>-deferred`、ブランチ `feature/<機能>-deferred`）で S8〜S11 を対象のタスクだけに行い、`merge(<機能>): deferred` の件名でマージする。進捗は別の trailer（`Speckit-Deferred-Step`）で記録し、もとの機能の進捗は変えない。
- 片付けたタスクは `- [x]` にし、`[後]` の印は残す（後回しにした記録として）。

### ほかの機能の一部だけを先に作る（`--until`・`--partial`）

ある機能の前提として、別の機能の一部（例: `000-app-basic` の認証の Phase だけ）を先に入れたいときは、`speckit-coding <機能> --until "Phase N"` で、`tasks.md` のその Phase までを実装して止め、`finish <機能> --phase coding --partial` で `main` に入れる。件名は `merge(<機能>): partial` になり、その機能の進捗（S8 以降）は進まない。残りは後で同じ `speckit-coding <機能>` で S8 から続ける。`status` の実装の列に「（一部をマージ済み）」と出る。

### Claude Code のクラウドセッション

環境変数 `CLAUDE_CODE_REMOTE` が `true` のときは、Claude Code のクラウドセッション（claude.ai/code、`claude --cloud`）で動いている。この節は、そのときだけ当てはまる。`CLAUDE_CODE_REMOTE` が `true` でなければ（ローカルや、ほかのエージェント）、この節は読み飛ばし、これまでどおりに動く。

クラウドセッションには、ローカルにない次の制約がある。

- push できるのは、セッションの作業ブランチ（`claude/...` など）だけである。`main` や `feature/*` には push できない。
- VM は、しばらく操作がないと回収される。会話は戻るが、push していないコミット、ローカルのブランチ、`.worktrees/` は戻らない。
- 待機した後に質問へ回答すると、回答が効かないことがある（不具合の報告がある）。
- WebFetch がネットワークの設定で止められることがある（報告がある）。WebSearch は使える。

そのため、次のように動く。

- **マージ先**: `speckit-feature`・`speckit-coding`・`speckit-all` は、`SPECKIT_MAIN_BRANCH` がなければ、セッションの作業ブランチをマージ先にする。スキルの本文の `main` は、その作業ブランチに読み替える。`worktree_helper.py` がこれを自動で判定し、`finish` の後に作業ブランチを push する。`main` へは PR で取り込む。`main` に切り替えたり（`--switch`）、`main` に直接 push したりしない。
- **push**: 作業ブランチにコミットしたら、そのたびに作業ブランチを push し、VM が回収されても成果が残るようにする（`speckit-bootstrap` のステップごとのコミットなど）。
- **中断と再開**: `feature/*` のブランチは push できないので、1 つのフィーチャーは 1 つのセッションで `finish` まで進める。複数のフィーチャーを進めるときも、1 件ずつ `finish` して作業ブランチに取り込む。
- **質問**: `--auto` か `--oneshot` で進めることを勧める。対話で進めるときは、ユーザーがすぐに答えられないと、回答が失われるおそれがあることを先に伝える。
- **Web 調査**: WebFetch が失敗したら、WebSearch の結果で進める。ページを開けなかった出典は、その旨を書く。数字を推測で埋めない。
- **push できない変更**: `.github/workflows/` の下を変えるコミットは、push を拒否されることがある（報告がある）。拒否されたら、その変更を `[人]` のタスクに分け、ローカルで反映するよう案内する。
- **新規プロジェクト**: `new-speckit-project` はローカルで実行するコマンドである。`--cloud <owner>/<name>` を付けると、GitHub にリポジトリを作って push し、クラウドセッションで立ち上げを始める。

## ディレクトリ構成

```text
.specify/
├── memory/constitution.md   # プロジェクト憲章（最上位の規範）
├── templates/               # spec / plan / tasks などのテンプレート
├── scripts/python/          # Spec Kit のヘルパースクリプト（Python）
└── workflows/               # Spec Kit のワークフロー定義
specs/
└── <NNN-feature-name>/      # フィーチャーごとの成果物
    ├── spec.md
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── contracts/
    ├── checklists/
    ├── ui.md                # 画面仕様（speckit-feature の S4-1、speckit-design）
    └── tasks.md
docs/
├── adopt-plan.md            # 既存のプロジェクトへの取り込みの計画（speckit-bootstrap --adopt）
├── concept/                 # コアコンセプト（入力）と backlog.md
├── feature/                 # 機能概要（000 は共通基盤、999 は運用基盤）と spec_order.md
├── design/                  # デザインの共通の決め事（speckit-design）。DESIGN.md、EXPERIENCE.md、tokens.tokens.json
├── architecture.md          # 構成と技術スタック（speckit-architecture）
├── project.md               # 事業計画（speckit-project）
├── presentation/            # 企画書（speckit-presentation）。design.yaml と <読み手>/slides.md・proposal.pptx
└── nfr.md                   # 全機能が守る非機能要件（speckit-nfr-feature）
.kiro/steering/              # エージェント共通ルールの正本（このディレクトリ）
```

`.specify/templates/`、`.specify/scripts/` と、Spec Kit の標準スキル（`speckit-specify`、`speckit-plan` など、上の標準ワークフローの表にあるもの）は Specify CLI が生成したファイルなので、直接編集しない。追加スキルは `skills/speckit/` のファイルを直接編集してよい。どちらも、各エージェントのスキルディレクトリ（`.claude/skills/` など）にあるのはシンボリックリンクなので、編集は `skills/speckit/` 側で行う。

このプロジェクトでは `specify init --here --force`、`specify integration install` / `upgrade` / `switch` / `uninstall` を実行しない。スキルがシンボリックリンクのため、リンク先の共有スキルがエージェント固有の内容で上書きされるか、削除される。エージェント向けの manifest（`.specify/integrations/*.manifest.json`）は実体と対応しないため置いていない。スキルを更新するときは、`skills/speckit/` 側で行う。
