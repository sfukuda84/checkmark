---
name: "speckit-all"
description: "フィーチャーの仕様工程と実装工程を 1 つの Git worktree で通して実行するスキル。worktree の準備（既存があれば再利用して続きから再開）、speckit-feature の仕様工程（specify・clarify x 2・画面仕様・plan・tasks・analyze x 3）、speckit-coding の実装工程（implement・converge・2 軸レビュー x 2）を途中でマージせずに続けて行い（回数は機能の重さ（軽・標準・重）で減る）、最後に main へのマージと後片付けを行う。--auto を付けると、質問せずに推奨案を採用して進める。--with-mock を付けると、画面仕様で Claude Design のモックも作る。"
argument-hint: "フィーチャー番号または範囲と、任意の --auto、--with-mock、--weight 軽|標準|重（例: 001, 002-005, all, all --auto, 003 --with-mock, または省略して次の未完了）"
compatibility: "Requires git, spec-kit project structure with .specify/ directory"
user-invocable: true
disable-model-invocation: false
---

# speckit-all スキル（通し: S1 → S2〜S11 → S12）

仕様工程と実装工程を、1 つの worktree の中で途中マージなしに通して実行する。本体の手順はこのファイルには書かず、次の 2 つのファイルの「§3 本体」をそのまま使う。

- 仕様工程 S2〜S7-3: [`speckit-feature` の §3](../speckit-feature/SKILL.md)
- 実装工程 S8〜S11: [`speckit-coding` の §3](../speckit-coding/SKILL.md)

**ステップ番号、ヘルパースクリプト（`$HELPER`）、再開、安全規則、対話、引数の解釈は [`speckit-worktree`](../speckit-worktree/SKILL.md) に従う。** 作業を始める前に、`speckit-worktree`、`speckit-feature`、`speckit-coding` の 3 つの SKILL.md を読むこと。

## 1. ユーザー入力・引数

```text
$ARGUMENTS
```

引数の解釈と複数フィーチャーの進め方は `speckit-worktree` の §5 に従う。自動検出では `--phase all` を使う。

質問は、仕様工程の「質問の窓」（`speckit-feature` §3。仕様の前と計画の前）と、実装工程の S8 の終わりの確認（`speckit-coding` の S8）にまとめる。通しで実行しても、この 3 か所のほかでは止めて聞かない（例外は `speckit-worktree` §4「質問はまとめる」）。

**担当への任せ方**: 量の多い作業（S8 の Phase、S9、軸ごとのレビュー、指摘の修正）はサブエージェントに任せ、親は質問・採否・`checkpoint`・検証の再実行を持つ（`speckit-worktree` §4「親と担当の役割」。雛形は [references/delegation.md](../speckit-worktree/references/delegation.md)）。通しで実行すると会話が長くなるので、ステップの境目で区切って再開してよい（`speckit-worktree` §4「文脈の節約」）。

引数に `--auto` があるときは、仕様工程から実装工程、S12 までのすべての質問を `speckit-worktree` §6 の自動モードで扱う。`speckit-feature` と `speckit-coding` の本文にある 💬 の質問も、質問せずに推奨案を採用する。自動モードでも止まる場面（マージの競合など）では、§6「止まったときの扱い」に従う。

引数に `--with-mock` があるときは、仕様工程の S4-1（画面仕様）で Claude Design のモックを作る（`speckit-design` §4）。

工程の重さは、機能ファイルの `**重さ**`（S1 の `WEIGHT`）で決まり、仕様工程と実装工程の両方で省くステップが変わる（`speckit-worktree` §2「機能の重さ」）。引数に `--weight 軽|標準|重` があるときは、その重さで進める。

## 2. 実行の流れ

対象フィーチャーごとに、次を順に行う。

1. **S1 準備**: `speckit-worktree` §3「S1 準備」に従い、`$HELPER ensure <feature> --phase all` を実行する。
   - 仕様がすでに `main` にマージ済みのフィーチャーは、S2〜S7-3 が完了済みと判定され、`NEXT_STEP` が S8 になる。
   - 出力に `MISSING_ARTIFACTS: ui.md` があれば、S8 の前に `ui.md` を作る（`speckit-worktree` §3「S1 準備」の 5）。
2. **仕様工程**: `speckit-feature` の §3 の S2〜S7-3 のうち、`NEXT_STEP` 以降を順に実行する。
   - `speckit-feature` の §2（S1 と S12）は実行しない。**S7-3 の後で `finish` を実行せず、マージしないこと。**
3. **実装工程**: 同じ worktree のまま、`speckit-coding` の §3 の S8〜S11 を順に実行する。
   - `speckit-coding` の §2（S1 と S12）は実行しない。worktree を作り直さないこと。
4. **S12 片付け**: `speckit-worktree` §3「S12 片付け」に従い、`$HELPER finish <FEATURE_NAME> --phase all` を実行する。
5. 次のフィーチャーがあれば 1 に戻る。

途中で中断した場合は、もう一度 `speckit-all` を実行すれば、残っている worktree を使って続きのステップから再開する。仕様工程の途中なら `speckit-feature`、実装工程の途中なら `speckit-coding` で再開することもできる。その場合は、再開したスキルの S12 で `main` にマージされる。

## 3. 完了報告

各フィーチャーの完了時と、指定範囲の全体の完了時に、`speckit-feature` §4 と `speckit-coding` §4 の項目をまとめて報告する。

- 完了したフィーチャー名と番号、マージコミット
- 仕様工程の要約（clarify で確定した決定事項、質問の窓で聞いた回数と問数、analyze の検証結果）
- `decisions.md` の要約（S8 の終わりに確かめた結果と、S9〜S11 で推奨案で決めたこと）
- 実装工程の要約（実装内容、テスト結果、converge の結果、レビューで直した指摘）
- 残っている `[人]` のタスク（`finish` の `HUMAN_TASKS_PENDING`）と、片付けた後の手順（`speckit-worktree` §3「人のタスクの片付け」）
- 残っている `[後]` のタスク（`finish` の `DEFERRED_TASKS_PENDING`）と、それぞれをいつ行うか（`speckit-worktree` §3「後の段階のタスク」）
- 飛ばした、または中断したフィーチャーとその理由
- `--auto` のとき: 自動で採用した判断の要約（`auto-decisions.md`）と、止まったフィーチャーについてユーザーに判断してほしい事項
- 次の案内: `$HELPER next --phase all` の結果
