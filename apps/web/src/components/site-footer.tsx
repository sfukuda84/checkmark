import Link from "next/link";

/** すべての画面の下部の案内（FR-021: Cookie の選択をあとから変えられる導線）。 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="規約とポリシー">
        <Link href="/legal/terms">利用規約</Link>
        <Link href="/legal/privacy">プライバシーポリシー</Link>
        <Link href="/legal/cookies">Cookie の設定</Link>
      </nav>
    </footer>
  );
}
