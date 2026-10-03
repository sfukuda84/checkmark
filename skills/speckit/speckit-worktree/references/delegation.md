# 担当への依頼文の雛形

`speckit-worktree` §4「親と担当の役割」で、親（実行中のエージェント）がサブエージェント（担当）に作業を任せるときの依頼文の雛形。`<…>` を埋めて使う。gamekit で機能を通したときの依頼文を元に、speckit の工程（2 軸レビュー、`decisions.md`、レビューの予算）に合わせている。

共通の決め事:

- **渡すもの**: 作業場所（worktree の絶対パスとブランチ）、範囲（ステップ、Phase、指摘の ID）、守る規則（憲章、steering、`docs/architecture.md`、`docs/nfr.md`、`decisions.md`）、検証のコマンド、報告の形。
- **渡さないもの**: 実装の経緯や親の見立て（とくにレビュー担当には「たぶん問題ない」を渡さない）。
- **させないこと**: `checkpoint`、マージ、push、ユーザーへの質問、範囲の外の編集、破壊的な git の操作。
- **報告の形**: 件数、決めたこと（`decisions.md` に足した番号）、検証の結果、止まったことがあればその理由だけ。差分や全文を貼らせない（親の文脈を守るため）。
- 親は報告を受けたら、検証のコマンドを自分でもう一度実行し、疑問のある箇所だけファイルの行を開いて裏を取る。

## 1. 実装担当（S8・S9）

S8 は Phase ごとに分けて、順に任せる（Phase には依存があるので並行にしない）。

```text
あなたは <FEATURE_NAME> の S8（実装）の第 <N> 弾の担当。worktree <WORKTREE_DIR>（ブランチ feature/<FEATURE_NAME>。前の弾はコミット <hash> まで）。
specs/<FEATURE_NAME>/tasks.md の <Phase の範囲（例: Phase 2 と Phase 3）> を実装する。
- 手順: speckit-implement と speckit-coding の S8 の規則。設計は specs/<FEATURE_NAME>/ の spec・plan・data-model・contracts・ui と、
  憲章 .specify/memory/constitution.md、docs/architecture.md、docs/nfr.md を守る（<とくに守る原則>）。テストを先に書く。
- 画面は ui.md と docs/design/ に従い、色・文字・余白などの値はトークンから使う。
- [人] と [後] の付いたタスクは実行しない（[人] は手順を報告に書く）。
- 区切りごとに <テストのコマンド>、<リンターのコマンド>、<ビルドのコマンド> を通す。
- tasks.md の完了したタスクを [x] にする。仕様の隙間は推奨案で決め、specs/<FEATURE_NAME>/decisions.md に続き番号で記録する
  （# | ステップ | 決めたこと | 理由 | ほかの案 | 反映先 | 確認の結果。確認の結果は空欄のまま。親がユーザーに確かめる）。
- 普通のコミット（trailer なし）は区切りでしてよい。checkpoint・マージ・push・ユーザーへの質問はしない。
  範囲の外の Phase には手を付けない（範囲の完了に必要な最小限を除く）。
終わったら、完了したタスクの範囲、テスト・リンター・ビルドの結果、decisions.md に足した番号と要点だけを短く報告する。
```

S9（収束）の担当も同じ形にし、範囲を「speckit-converge と speckit-coding の S9 の手順で、コードを spec・plan・tasks・contracts・憲章と照合し、ギャップを `## Phase N: Convergence` として足して実装し、✅ Converged まで繰り返す」にする。未完了の `[人]`・`[後]` はギャップに数えないことも書く。

## 2. レビュー担当（S10・S11、軸ごと）

軸ごとに 1 人ずつ、会話の文脈を持たない担当（Claude Code では general-purpose のサブエージェント）にする。Standards 軸と Spec 軸は並行に走らせてよい。`speckit-review` §2.1 で省いた軸には担当を立てない。

```text
Independent reviewer, round <1|2>, axis "<Standards|Spec>" only. Read-only (do NOT edit or commit).
Worktree: <WORKTREE_DIR>. Diff: `git diff main...HEAD`<2 回目（標準）: `git diff <S9 のチェックポイントのコミット>..HEAD` だけ / 2 回目（重）: 両方>.
Criteria: section "【軸 <A|B>: …】" in <skills>/speckit-review/SKILL.md, and §2.1 "予算と打ち切り" (skipped perspectives: <なし / 観点と理由>).
Baselines: <軸ごとの基準。Standards → docs/architecture.md, docs/nfr.md, constitution, linters / Spec → specs/<FEATURE_NAME>/{spec,ui,plan,data-model,contracts}, constitution, docs/design/>.
<2 回目: Read specs/<FEATURE_NAME>/reviews/review-1.md first; verify the R1 fixes and look for regressions and side effects. Do not repeat R1 findings that were fixed.>
Ignore unchecked tasks marked [人] or [後] (not missing work), and items already listed in specs/<FEATURE_NAME>/reviews/backlog.md.
Stance: look for reasons to reject. Every finding needs evidence (file:line, doc location).
Report every finding, CRITICAL/HIGH first. If there are more than 15 findings on this axis, list LOW items in one line each under "backlog" instead of full entries.
Output in Japanese, IDs R<round>-<S|P><nn> (S = Standards, P = Spec), form:
#### R1-S01: [CRITICAL/HIGH/MEDIUM/LOW] 題
- **対象**: file#Lx-Ly
- **根拠**: ...
- **直し方**: ...
Then a one-line count by severity. Under ~800 words.
```

## 3. 修正担当（S10・S11 の修正）

```text
あなたは <FEATURE_NAME> の S<10|11>（レビュー <1|2> 回目）の修正担当。worktree <WORKTREE_DIR>（<直前の checkpoint のコミット>）。
次の採否の表のとおりに対応する（親が裏を取って決めた）:
| ID | 採否 | 直し方（親の決定） |
|---|---|---|
| R1-S01 | 採用 | <…> |
| R1-P03 | 採用 | <…> |
| R1-S07 | backlog | specs/<FEATURE_NAME>/reviews/backlog.md に送る（1 軸 15 件を超えた LOW） |
| R1-P05 | 不採用 | （直さない。理由は親が記録する） |
- 重複（<ID=ID>）は 1 回で直す。ユーザーの決定: <あれば>。
- 直し方に判断が要るものは推奨案で直し、decisions.md に続き番号で記録する。
- 仕様・計画を変えたら spec.md（Clarifications に `### Session <日付> (Review <n>)`）・plan・contracts・tasks にも反映する。
  tasks.md の末尾に `## Phase N: Review <n>` として直したタスクを [x] で記録する。
- 検証: <テストのコマンド>、<リンターのコマンド>、<ビルドのコマンド>。普通のコミットはしてよい。checkpoint は親。
- 止める条件: <例: 指摘どおりに直すと契約（contracts/）が変わるとき（理由を報告する）>。
終わったら、直した件数、指摘の案から変えたもの、decisions.md に足した番号、検証の結果だけを短く報告する。
```
