import { cookies } from "next/headers";
import { COOKIE_CONSENT_COOKIE, parseCookieConsent } from "@/legal/cookie-consent";
import { CookieChoiceForm } from "./choice-form";

export const dynamic = "force-dynamic";

export default async function CookiesPage() {
  const current = parseCookieConsent((await cookies()).get(COOKIE_CONSENT_COOKIE)?.value);
  return (
    <>
      <h1>Cookie の設定</h1>
      <p>必須の Cookie は、ログインの状態を保つために常に使います。必須でない Cookie（分析など）を使うかを選べます。</p>
      <CookieChoiceForm current={current} />
    </>
  );
}
