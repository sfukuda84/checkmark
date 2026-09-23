# 機能バックログ

**名前の候補チェックサービス（商標・Google 検索・ドメイン・SNS を 1 回の入力でまとめて確かめる）の機能概要**を 1 機能 1 ファイルで置く場所。
`/speckit-specify` に渡す入力素材であり、詳細な要件定義やタスク分解は spec 化（`specs/`）の段階で詰める。

## 使い方

1. 着手する機能のファイルを読む
2. 末尾の「`/speckit-specify` に渡す記述案」をそのまま、または調整して実行する（`speckit-feature` / `speckit-all` を使う場合は想定順序の番号を渡す）
3. spec が作られたら、そのファイルの **状態** を `spec化済み（specs/NNN-<slug>）` に更新し、**下の一覧表の状態欄も同時に直す**
4. **以降その機能の正本は `specs/` 側。** このファイルは追記せず、素材・履歴として残す

## 運用ルール

- **ここは進捗管理の場所ではない。** 進捗の正本は `specs/` 配下の spec と tasks
- 記述は**広く浅く**。カラム型・API パス・数値パラメータは書かず、`/speckit-clarify` と `/speckit-plan` で決める
- 根拠は [premises.md](./premises.md) と `docs/concept/` に置く。新しい前提が決まったら premises.md に追記する
- ファイル名は `NNN-<slug>.md`。`NNN` は想定順序で（`000` は共通基盤、`999` は運用基盤の予約番号）、`specs/NNN-<slug>` とブランチ名にそのまま対応する
- 機能を追加・分割したら、同じ様式でファイルを足し、**一覧表に行を足す**。**番号は振り直さない**。新しい機能は既存の最大値の次から振る
- **区分・状態・依存欄は各ファイルのヘッダ行をそのまま写す**（依存は `001-trademark-batch-check` のような完全名）。表記を変えると検証で不一致になる

## メタ文書（機能ファイルではない）

| ファイル | 何が書いてあるか |
|---|---|
| [premises.md](./premises.md) | **前提の正本。** 入力の仕分け、必須項目の充足状況、ヒアリングの質疑記録 |
| [spec_order.md](./spec_order.md) | **着手順序の正本。** MVP / 拡張ごとの段階分け、被参照数、依存グラフ |
| [../concept/backlog.md](../concept/backlog.md) | **機能候補の正本。** まだ機能化していない候補と却下した候補。`speckit-concept-2-feature --backlog <ID>` で機能化する |

## 一覧

**# は想定順序（採番）。着手順序は [spec_order.md](./spec_order.md) が正本。**

| # | 機能 | 区分 | 状態 | 依存 | 一言 |
|---|---|---|---|---|---|
| 0 | [アプリ基盤](./000-app-basic.md) | MVP | 未着手 | — | 個人アカウントの認証、退会、規約と Cookie の同意、メール、メンテナンス表示 |
| 1 | [候補名の一括チェックと商標照合](./001-trademark-batch-check.md) | MVP | 未着手 | 000-app-basic | 複数候補を一括実行し、商標の同一・称呼類似を比較表に示す |
| 2 | [Google 検索の使用状況チェック](./002-google-search-check.md) | MVP | 未着手 | 000-app-basic, 001-trademark-batch-check | Google の上位結果と「該当あり／なし」の目安を比較表に加える |
| 3 | [ドメイン・SNS の空き確認](./003-domain-sns-check.md) | MVP | 未着手 | 000-app-basic, 001-trademark-batch-check | 選んだ TLD の空きと SNS の使用状況（YouTube は自動、X・Instagram・TikTok はリンク）を比較表に加える |
| 4 | [チェック履歴の管理](./004-check-history.md) | MVP | 未着手 | 000-app-basic, 001-trademark-batch-check | 過去のチェックを本人だけが見返し、削除できる |
| 5 | [運営者の管理画面とお問い合わせ](./005-operator-console.md) | MVP | 未着手 | 000-app-basic, 001-trademark-batch-check | 利用者の停止、上限の設定、外部 API の利用量、監査ログ、お問い合わせ |

**件数**: 機能ファイル **6 件**（MVP 6 / 拡張 0）。

## 検証

```bash
python3 .claude/skills/speckit-concept-2-feature/scripts/validate.py docs/feature
```
