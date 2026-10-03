---
name: "speckit-coding"
description: "フィーチャーの実装工程を実行するスキル。Git worktree の準備（既存があれば再利用して続きから再開）、実装（speckit-implement）、仕様収束（speckit-converge）、2 軸コードレビュー（speckit-review）と修正、再レビューと修正（軽の機能では省く）を行い、main へのマージと後片付けまでを実行する。spec.md・plan.md・tasks.md が必要で、なければ speckit-feature を案内する。"
argument-hint: "フィーチャー番号または範囲と、任意の --auto と --weight 軽|標準|重。単一のフィーチャーなら --until \"Phase N\" か --deferred [T045,T046] も（例: 001, 002-005, all, all --auto, 000 --until \"Phase 2\", 001 --deferred, または省略して次の未実装）"
compatibility: "Requires git, spec-kit project structure with .specify/ directory"
user-invocable: true
disable-model-invocation: false
---

# speckit-coding スキル（実装工程: S1 → S8〜S11 → S12）

仕様工程（[`speckit-feature`](../speckit-feature/SKILL.md)）で作った `spec.md`、`plan.md`、`tasks.md` に基づき、実装、収束の検証、2 回のコードレビューと修正を行い、`main` にマージする。

- 仕様から実装までを 1 つの worktree で通して行う場合は [`speckit-all`](../speckit-all/SKILL.md) を使う。`speckit-all` は、このファイルの「§3 本体」だけを実行する。

**ステップ番号、ヘルパースクリプト（`$HELPER`）、再開、安全規則、対話、引数の解釈は [`speckit-worktree`](../speckit-worktree/SKILL.md) に従う。** 作業を始める前に必ず読むこと。

## 1. ユーザー入力・引数

```text
$ARGUMENTS
```

引数の解釈と複数フィーチャーの進め方は `speckit-worktree` の §5 に従う。`--auto` があるときは、下の 💬 の質問も含めて `speckit-worktree` §6 の自動モードで進める。自動検出では `--phase coding` を使い、`main` の `tasks.md` に未完了のタスク（`- [ ]`）が残っているフィーチャーを対象にする。

### 一部の Phase だけを先にマージする（`--until "Phase N"`）

引数に `--until "Phase N"` があるときは、ほかの機能の前提として、この機能の `tasks.md` のその Phase までだけを実装して止める（steering「ほかの機能の一部だけを先に作る」）。単一のフィーチャーの指定とだけ組み合わせる。

1. S1 は通常どおり（`$HELPER ensure <feature> --phase coding`）。
2. S8 の手順で、Phase 1 から指定の Phase までのタスクを実装し、`- [x]` にする。テスト、ビルド、リンターを通す。その Phase の Checkpoint（`tasks.md` に書かれていれば）も確かめる。
3. S8 の `checkpoint` は記録しない（S8 は終わっていない）。区切りのコミットは trailer なしで作る。S9 以降は行わない。S8 の終わりの確認（`decisions.md`）も、続きを実装するときに回す。
4. worktree の外で `$HELPER finish <FEATURE_NAME> --phase coding --partial` を実行して `main` に入れる（`speckit-worktree` §3「一部だけを先にマージする」）。
5. 完了報告で、実装した Phase と残りのタスクの件数、続きは `speckit-coding <FEATURE_NAME>` で S8 から行うことを示す。

### 後の段階のタスク（`--deferred`）

引数に `--deferred [T045,T046]` があるときは、実装まで `main` にマージ済みの機能の、後の段階のタスク（`[後]`）を片付ける（steering「後の段階に回すタスク」、`speckit-worktree` §3「後の段階のタスク」）。タスクの ID を省くと、未完了の `[後]` をすべて対象にする。単一のフィーチャーの指定とだけ組み合わせる。

1. **S1**: `$HELPER ensure <feature> --phase deferred [--tasks T045,T046]`。`NO_DEFERRED_TASKS`（未完了の `[後]` がない）と `NOT_IMPLEMENTED`（実装がまだマージされていない。通常の `speckit-coding` を案内する）で止まる。出力の `DEFERRED_TARGETS` が対象、`NEXT_STEP` が続きのステップである。作業場所は `WORKTREE_DIR`（`.worktrees/<feature>-deferred`）。
2. **S8**: 対象のタスクだけを §3 の S8 の規則（テストファースト、`decisions.md`）で実装し、`- [x]` にする。`[後]` の印は残す。対象外のタスクには手を付けない。S8 の終わりの確認も、この作業で決めたことについて行う。
3. **S9**: 対象のタスクと、その差分が触れた範囲で収束を確かめる（機能全体の照合はしない）。
4. **S10・S11**: `speckit-review` を、機能の重さの規則と予算（`speckit-review` §2.1）で行う。差分は `git diff main...HEAD`（後の段階の作業の分だけ）。S10 で CRITICAL・HIGH が 0 件なら、重さに関わらず S11 を `--skipped "S10 で CRITICAL・HIGH が 0 件"` で省いてよい（省けるのは S11 だけ）。
5. 各ステップの記録は `$HELPER checkpoint <feature> <step> "<subject>" --phase deferred`（trailer `Speckit-Deferred-Step`。もとの機能の進捗は変えない）。
6. **S12**: worktree の外で `$HELPER finish <feature> --phase deferred`。対象が `- [x]` でなければ `DEFERRED_TARGETS_UNCHECKED` で止まる。件名は `merge(<feature>): deferred` で、機能ファイルの状態を残りの `[人]`・`[後]` に合わせる（`sync-status` は要らない）。
7. **完了報告**: 片付けたタスク、テストとレビューの結果、残りの `[人]`・`[後]`（`HUMAN_TASKS_PENDING`・`DEFERRED_TASKS_PENDING`）。

## 2. 実行の流れ（単独実行）

対象フィーチャーごとに、次を順に行う。

1. **S1 準備**: `speckit-worktree` §3「S1 準備」に従い、`$HELPER ensure <feature> --phase coding` を実行する。
   - 仕様工程の途中の worktree がある場合は `SPEC_INCOMPLETE`、仕様がどこにもない場合は `SPEC_MISSING` で止まる。そのときは何も作らずに、`speckit-feature` または `speckit-all` の実行を案内する。
   - worktree がなく、仕様が `main` にマージ済みの場合は、`main` から新しい worktree を作る。
   - 出力に `MISSING_ARTIFACTS: ui.md` があれば、S8 の前に `ui.md` を作る（`speckit-worktree` §3「S1 準備」の 5）。S8 は `ui.md` を前提に画面を作るためである。
   - `speckit-all` などで仕様工程を終えた worktree が残っている場合は、それを再利用する。
2. **本体**: 下の §3 の S8〜S11 のうち、`NEXT_STEP` 以降を順に実行する。
3. **S12 片付け**: `speckit-worktree` §3「S12 片付け」に従い、`$HELPER finish <FEATURE_NAME> --phase coding` を実行する。
4. 次のフィーチャーがあれば 1 に戻る。

## 3. 本体（S8〜S11）

作業場所は `WORKTREE_DIR`、仕様ディレクトリは `specs/<FEATURE_NAME>`（以下 `FEATURE_DIR`）である。各ステップの最後に `speckit-worktree` §2 の subject で `checkpoint` を記録する。

テスト、ビルド、リンターのコマンドは `speckit-worktree` §4 に従って判断する。

**担当への任せ方**: サブエージェントが使えるときは、S8（Phase ごとに分ける）、S9、軸ごとのレビュー、指摘の修正をサブエージェントに任せてよい。親は質問、採否、`checkpoint`、検証の再実行を持つ（`speckit-worktree` §4「親と担当の役割」「文脈の節約」）。依頼文の雛形は `speckit-worktree` の [references/delegation.md](../speckit-worktree/references/delegation.md) にある。

機能の重さ（S1 の `WEIGHT`）によって、レビューの回数が変わる（`speckit-worktree` §2「機能の重さ」）。軽は S10 の 1 回だけ（S11 は `--skipped`）、標準は 2 回で 2 回目は S10 の修正の差分だけ、重は 2 回で 2 回目もブランチ全体を見る。S8・S9・S10 はどの重さでも省かない。

### S8: 実装（speckit-implement）

1. `speckit-implement` スキルの手順に従い、`FEATURE_DIR/tasks.md` の全タスクを実装する。
   - Phase 1（Setup）→ Phase 2（Foundational）→ Phase 3 以降（User Stories）→ Final Phase（Polish）の順を守る。
   - テストファースト（TDD）で進め、契約、エンティティ、ロジックのテストを書いて実行する。
   - タスクが終わるごとに `tasks.md` のチェックボックスを `- [x]` に更新する。
   - 画面は `FEATURE_DIR/ui.md` と `docs/design/` に従って作る（どちらかがなければ、あるものに従う）。色、文字、余白などの値は `docs/design/` のトークンから使い、コードに直接書かない。
   - `[人]` の付いたタスクは実行しない。手順を示して保留にし、依存しない後続のタスクを続ける（プロジェクトの steering の「人が行うタスク」）。
   - 途中で区切りのよいところでは、trailer なしの通常のコミットを作ってよい。
2. テスト、ビルド、リンターを実行し、すべて通ることを確かめる。コマンドは `$HELPER commands get test` などで読む。記録がなく、この S8 で決めたものは `$HELPER commands set` で記録する（`speckit-worktree` §4「開発コマンド」）。
3. **決めたことの確認**: 実装中に推奨案で決めたこと（仕様の隙間、例外時の挙動、設計方針の分岐、ライブラリの選定）は、その都度ユーザーに聞かず、`FEATURE_DIR/decisions.md`（様式: [templates/decisions.md](templates/decisions.md)）に記録しておく。仕様工程（窓で聞ききれなかった論点、S5〜S7 の判断）で記録したものも含めて、「確認の結果」が空の行を、ここで 1 回にまとめて確かめる。件数に上限は設けない。
   - 本文に全件を番号付きで並べ（決めたこと、理由、推奨案、ほかの案）、「推奨案のまま採用してよいか。変えるものは番号と案を答えてほしい」と 1 回で聞く。重要なもの（仕様の振る舞いを変えるもの）は、同じ 1 回の中で AskUserQuestion の選択肢にしてもよい（最大 4 問）。
   - 回答を「確認の結果」の列に書く。変える決定があれば、コードと `spec.md`・`plan.md`・`tasks.md` を直し、テストを通し直す。
   - 確かめる行がなければ、質問せずに次へ進む。
   - 自動モードでは確かめない。新しい判断は `auto-decisions.md` に書き（`speckit-worktree` §6「記録」）、`decisions.md` に残っている行は「確認の結果」を「自動で採用」にする。
4. `checkpoint <FEATURE_NAME> S8` を記録する。

> 💬 実装中に出てきた仕様の隙間、例外時の挙動、設計方針の分岐は、推奨案で進めて `decisions.md` に記録し、手順 3 でまとめて確かめる。待つと作業が無駄になるもの（作る対象の取り違え、憲章・`docs/architecture.md`・`docs/nfr.md` の変更が要るもの）だけは、その場で止めて聞く。仕様を変える場合は、コードだけでなく `spec.md`、`plan.md`、`tasks.md` にも反映する。

### S9: 仕様収束（speckit-converge）

1. `speckit-converge` スキルの手順に従い、コードベースを `spec.md`、`plan.md`、`tasks.md`、憲章と照合する。
   - ギャップの種類（`missing`: 未実装、`partial`: 不完全、`contradicts`: 矛盾、`unrequested`: 仕様にない追加）を調べる。
   - テストの不足や、考慮されていないエッジケースも併せて調べる。
2. ギャップがある場合は、`tasks.md` の末尾に `## Phase N: Convergence` として不足タスクを追加し、S8 と同じ手順で実装とテストを行う。もう一度照合し、「✅ Converged」になるまで繰り返す。
3. 未達のギャップが 0 件になったら、`checkpoint <FEATURE_NAME> S9` を記録する。未完了の `[人]` のタスクはギャップに数えない。

> 💬 ギャップの解消方針は、推奨案で直して `decisions.md` に記録し、完了報告で示す。仕様（要件の追加や削除）や憲章を変える必要があるときだけ、まとめて 1 回聞く。

### S10: コードレビュー 1 回目と修正（speckit-review）

[`speckit-review`](../speckit-review/SKILL.md) スキルの手順に従い、2 軸のコードレビューを行う。外部の CLI には依存しない。審査する軸と観点、直す指摘の数、打ち切りは `speckit-review` §2.1「予算と打ち切り」に従う。

1. レビュー対象の差分として `git diff main...HEAD` を取得する（既定のブランチが main 以外で `SPECKIT_MAIN_BRANCH` を指定している場合は、その名前に読み替える。Claude Code のクラウドセッションでは、セッションの作業ブランチに読み替える。以下同じ）。
2. 2 軸でレビューする。
   - **Standards 軸**: セキュリティ上の脆弱性（インジェクション、認可漏れ、シークレット）、性能（不要な繰り返し処理、N+1 クエリ、インデックスの活用）、型安全性、コードの臭い（重複、肥大化）
   - **Spec 軸**: `spec.md` の機能要件と受入基準を満たしているか、仕様外の追加がないか、`plan.md`、`contracts/`、憲章と設計が整合しているか。画面のある機能で `ui.md` がある場合は、`ui.md` の画面・状態・文言と、`docs/design/` のトークンの使用（値の直書きがないか）、アクセシビリティの水準も確かめる
3. 指摘を `speckit-review` §2.1「直す指摘の数」に従って直す（1 軸 15 件以下なら LOW も含めて全件。15 件を超えたら CRITICAL・HIGH・MEDIUM を全件直し、LOW は `FEATURE_DIR/reviews/backlog.md` に送る）。テストがすべて通ることを確かめる。軽の機能で CRITICAL か HIGH があったときは、直した差分だけをその軸でもう一度確かめる（`speckit-review` §2.1「回数と打ち切り」）。
   - 可能なら、軸ごとに文脈を持たないサブエージェントで独立に審査し、親が指摘の裏を取ってから採否を決める（`speckit-review` §3.1・§3.2）。記録は `FEATURE_DIR/reviews/review-1.md` に残す。
4. `checkpoint <FEATURE_NAME> S10` を記録する。

> 💬 指摘への対応方針（リファクタリングの方針や優先度）は、推奨案で直して `decisions.md` に記録し、完了報告で示す。仕様や憲章を変える必要があるときだけ、まとめて 1 回聞く。

### S11: 再レビューと修正（speckit-review）

S10 の修正が既存のロジックを壊していないか、新たな不整合やエッジケースの抜けがないかを確かめるため、2 回目のレビューを行う。

軽の機能では行わず、S10 の修正の後にテストがすべて通ることを確かめてから、`checkpoint <FEATURE_NAME> S11 "<subject>" --skipped "軽: レビューは 1 回"` で記録する（S11 の記録で機能ファイルの状態欄が更新されるので、省いても記録は必ず行う）。

1. 対象の差分は機能の重さで決める。標準は S10 の修正差分（S9 のチェックポイントのコミットから HEAD まで。`git diff <S9 のチェックポイントのコミット>..HEAD`）だけ、重は S10 の修正差分と全体の差分（`git diff main...HEAD`）の両方を対象に、もう一度 `speckit-review` スキルを実行する。
2. 二次的な不整合、型定義の甘さ、考慮されていないエッジケース、テストの網羅性を最終確認する。
3. 残っている指摘を S10 と同じ数の規則で直し、テストがすべて通ることを確かめる。打ち切りは `speckit-review` §2.1「回数と打ち切り」に従う。CRITICAL・HIGH が 0 件なら、3 回目は行わずに次へ進む。CRITICAL か HIGH が残ったときは、直した差分だけをその軸でもう一度確かめる。それでも残るときは、止めてユーザーに判断を求める。修正がなくても次へ進む。
   - 審査の方法は S10 と同じにし、2 回目の担当には `review-1.md` を渡す。記録は `FEATURE_DIR/reviews/review-2.md` に残す。
4. `checkpoint <FEATURE_NAME> S11` を記録する。

> 💬 残っている指摘への対応の要否は、S10 と同じく推奨案で決めて `decisions.md` に記録する。

## 4. 完了報告

各フィーチャーの完了時と、指定範囲の全体の完了時に、次を報告する。

- 完了したフィーチャー名と番号、マージコミット
- 実装の要約とテスト結果
- converge の検証結果（追加したタスクがあればその内容）
- 残っている `[人]` のタスク（`finish` の `HUMAN_TASKS_PENDING`）と、片付けた後の手順（`speckit-worktree` §3「人のタスクの片付け」）
- 残っている `[後]` のタスク（`finish` の `DEFERRED_TASKS_PENDING`）と、それぞれをいつ行うか（`speckit-worktree` §3「後の段階のタスク」）
- レビューで見つかって直した指摘（行った回数、省いた観点、backlog に送った LOW の件数）
- `decisions.md` の要約: S8 の終わりに確かめた結果と、S9〜S11 で推奨案で決めたこと（見直しを勧めるものを先に）
- 機能の重さと、省いたステップ（`SKIPPED_STEPS`）
- 飛ばした、または中断したフィーチャーとその理由
- `--auto` のとき: 自動で採用した判断の要約（`auto-decisions.md`）と、止まったフィーチャーについてユーザーに判断してほしい事項
- 次の案内: `$HELPER next --phase coding` の結果（実装が未完了のフィーチャー）
- フロントエンドが React で、共通のコンポーネント（デザインシステム）を初めて実装したフィーチャー（多くは `000-app-basic`）では、Claude Code の `/design-sync` で Claude Design に取り込めることを案内する（`speckit-design` §4「実装した後」。ユーザーが実行するもので、このスキルからは実行しない）
