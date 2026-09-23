import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CookieBanner } from "@/components/cookie-banner";
import { SiteFooter } from "@/components/site-footer";
import { COOKIE_CONSENT_COOKIE, parseCookieConsent } from "@/legal/cookie-consent";
import "./globals.css";

export const metadata: Metadata = {
  title: "ネーミングチェッカー",
  description: "名前の候補を、商標・Google 検索・ドメイン・SNS でまとめて確かめる",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const chosen = parseCookieConsent((await cookies()).get(COOKIE_CONSENT_COOKIE)?.value) !== null;
  return (
    <html lang="ja">
      <body>
        <main className="container">{children}</main>
        <SiteFooter />
        <CookieBanner initiallyChosen={chosen} />
      </body>
    </html>
  );
}
