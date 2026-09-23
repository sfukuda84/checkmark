# 運営者の手順

## 運営者のロールの付与と取り消し（FR-027）

運営者のロールは、画面からは付与できない。サーバーの上で CLI を使う。

```bash
# 付与（対象のアカウントは、先にサインアップとメールアドレスの確認を済ませておく）
DATABASE_URL=... pnpm --filter @app/web ops:grant-operator operator@example.com

# 取り消し
DATABASE_URL=... pnpm --filter @app/web ops:revoke-operator operator@example.com
```

- 付与と取り消しは、実行した人と日時を運用の記録に残す（運営者の画面の監査ログは `005-operator-console` で扱う）。
- 変更は、対象の利用者の次の操作から反映される。

## 運営者が 0 人になった場合

運営者のアカウントを退会させた、または取り消しすぎて運営者がいなくなった場合も、上の CLI で付与し直せる。CLI はサーバーに入れる人だけが使えるので、画面から運営者を増やす手段は作らない。

## メンテナンス表示（FR-028、NFR-AV-003）

更新作業や商標データの取り込みで止めるときは、`web` を `MAINTENANCE_MODE=1` で起動し直す。すべての画面が `/maintenance`（HTTP 503）になる。終わったら `MAINTENANCE_MODE=0` に戻して起動し直す。

## 利用の停止（暫定）

利用者の停止の画面は `005-operator-console` で作る。それまでに停止が必要になった場合は、DB で `user.status` を `suspended` にする。次の操作で、その利用者のセッションは失効する。
