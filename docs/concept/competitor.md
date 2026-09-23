# 同類・競合調査

## 1. 同類・競合調査（2026-09-23）

> 本節は `speckit-concept-2-feature` による Web 調査の追記である。
> ここに挙げた機能分類は**提案**であり、採否はヒアリング（`docs/feature/premises.md`）で決めた。

### 1.1 調査対象

| サービス | 種別 | 対象規模 | 価格帯・課金単位 | 出典（参照日） |
|---|---|---|---|---|
| NAZUKE（AI ブランド名チェッカー） | 直接 | 新商品・新ブランドを出す企業、プロダクトチーム | 基本チェックは無料。有料プランの記載なし | https://nazuke.fujii-yuji.net/（2026-09-23） |
| Toreru 商標検索 | 直接（商標側） | 個人〜中小企業 | 検索・AI 調査は無料。出願は 1 区分 48,000 円〜（印紙代込み） | https://toreru.jp/ 、https://support.toreru.jp/hc/ja/articles/900006692246（2026-09-23） |
| Cotobox | 直接（商標側） | 個人〜中小企業 | 検索は無料。出願サービスは別料金 | https://cotobox.com/primer/search-recommended/（2026-09-23） |
| TM-RoBo | 直接（商標側） | 大手製造業のネーミング・ブランド開発 | 料金非公開（14 日間の無料トライアル） | https://ip-robo.co.jp/tm-robo/column/column-914/（2026-09-23） |
| TM-SONAR | 直接（商標側） | 知財部門・特許事務所 | 月額 2,000〜90,000 円 | https://cotobox.com/primer/search-recommended/（2026-09-23） |
| J-PlatPat | 隣接（公式 DB） | 全般 | 無料 | https://www.jpo.go.jp/support/startup/shohyo_search.html（2026-09-23） |
| namae / makko.biz など | 隣接（ドメイン・SNS の空き確認） | 全般 | 無料 | https://internet.watch.impress.co.jp/docs/yajiuma/1267645.html 、https://www.makko.biz/（2026-09-23） |
| J-PlatPat と Google 検索を手作業で併用 | 代替 | 全般 | 無料（手間がかかる） | https://www.kaipat.com/trademarkc/（2026-09-23） |

### 1.2 機能比較

| 機能 | NAZUKE | Toreru | Cotobox | TM-RoBo | J-PlatPat | 分類 |
|---|---|---|---|---|---|---|
| 文字商標の検索（登録・出願の有無） | ○ | ○ | ○ | ○ | ○ | 必須 |
| 称呼（読み）の類似検索・類似度の表示 | — | ○ | ○ | ○ | △（称呼検索のみ） | 必須 |
| 区分（指定商品・役務）での絞り込み | 不明 | ○ | ○ | ○ | ○ | 必須 |
| Web（検索エンジン）上の使用状況の確認 | 不明 | — | — | — | — | 差別化候補 |
| 商標と Web の結果を 1 画面でまとめて判定 | △（商標・ドメイン・SNS） | — | — | — | — | 差別化候補 |
| ドメイン・SNS アカウントの空き確認 | ○ | — | — | — | — | 差別化候補 |
| 多言語での意味・スラングの確認 | ○ | — | — | — | — | 対象外候補 |
| ロゴ（図形商標）の検索 | — | ○ | 不明 | 不明 | ○ | 対象外候補 |
| 検索履歴・候補名の比較 | 不明 | 不明 | 不明 | 不明 | — | 差別化候補 |
| 出願手続きへの連携 | — | ○ | ○ | — | — | 対象外候補 |

### 1.3 必要機能の洗い出し

- **必須（多くの競合が持つ）**: 文字商標の登録・出願の有無の検索、称呼の類似検索、区分による絞り込み。これがないと「商標のチェック」として信頼されない。
- **差別化候補**: 商標の検索とあわせて Web 検索上の同名の使用状況を 1 回の入力で確認し、結果を 1 画面にまとめる機能。調査した商標検索サービス（Toreru、Cotobox、TM-RoBo）はいずれも Web 検索の結果を示していない。弁理士事務所の解説でも、商標調査と Web 上の使用状況の確認は別の作業として説明されている（https://www.kaipat.com/trademarkc/、2026-09-23）。ドメイン・SNS の空き確認を同時に行うのは NAZUKE だけである。
- **対象外候補**: ロゴ（図形商標）の検索、出願代行、多言語の意味チェック、海外商標の検索。専門サービスや弁理士の領域であり、「同時にチェックできる」という中核価値から外れる。

### 1.4 業界の法規制・慣行

- J-PlatPat は、大量データのダウンロードや、ロボットアクセス（プログラムによる定期的な自動データ収集）を禁止しており、見つかった場合は予告なくアクセスが制限されることがある（出典: https://www.inpit.go.jp/j-platpat_info/guide/j-platpat_notice.html 、https://www.inpit.go.jp/j-platpat_info/guide/FAQ.html 、参照日 2026-09-23）。**サービスから J-PlatPat の画面を自動取得してはならない。**
- 特許庁は、特許・意匠・商標の出願情報を機械的に取得できる「特許情報取得 API」を令和 4 年 1 月から試行提供している（出典: https://www.jpo.go.jp/system/laws/sesaku/data/api-provision.html 、参照日 2026-09-23）。
- Google の Custom Search JSON API は新規受付を停止しており、2027-01-01 に既存の利用も停止する。Google が案内する代替（Agent Search、旧 Vertex AI Search）は企業向けで高額である（出典: https://brave.com/learn/google-api-shutdown/ 、https://developers.google.com/custom-search/v1/overview 、参照日 2026-09-23）。**Google 検索の結果を公式 API で取得する手段は、実質的に使えない。**
- Google 検索の結果を返す第三者 API の例: SerpApi は無料 250 件/月、有料は月額 $25（1,000 件）から（出典: https://scrappa.co/post/serpapi-alternative-2026 、参照日 2026-09-23）。Google 以外の検索エンジンの API として、Brave Search API は 1,000 件あたり $5、毎月 $5 分の無料クレジット（出典: https://brave.com/learn/google-api-shutdown/ 、参照日 2026-09-23）。
- 商標の類否の最終判断は専門家（弁理士）の領域であり、調査サービスは「簡易調査」「スクリーニング」と位置づけるのが一般的である（例: Toreru の AI 調査は「簡易検索」と説明している。出典: https://support.toreru.jp/hc/ja/articles/900006692246 、参照日 2026-09-23）。

### 1.5 確認できなかったこと

- 特許情報取得 API で、称呼（読み）による類似検索ができるか、商用サービスから利用してよいか、アクセス上限はいくつか（該当ページは取得時に 403 で読めなかった）。推測で埋めていない。`speckit-architecture` の段階で改めて確かめる。
- NAZUKE が Web 検索の使用状況を確認しているか、有料プランがあるか。
- Toreru 商標検索の機能の詳細（ページが動的に読み込まれ、取得できなかった）。
