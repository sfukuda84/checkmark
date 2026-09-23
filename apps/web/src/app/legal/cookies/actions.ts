"use server";

import { cookies } from "next/headers";
import { COOKIE_CONSENT_COOKIE, type CookieConsentChoice } from "@/legal/cookie-consent";

/** Cookie の同意の選択を 1 年保存する（FR-021）。 */
export async function setCookieConsent(optional: boolean): Promise<CookieConsentChoice> {
  const choice: CookieConsentChoice = optional ? "all" : "essential";
  (await cookies()).set(COOKIE_CONSENT_COOKIE, choice, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return choice;
}
