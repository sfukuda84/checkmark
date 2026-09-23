"use server";

import { cookies } from "next/headers";
import { PENDING_CONSENT_COOKIE, PENDING_CONSENT_MAX_AGE_SECONDS, pendingConsentValue } from "@/legal/consent";

export type ConsentActionResult = { ok: true } | { ok: false; code: "CONSENT_REQUIRED" };

/** サインアップの前の同意を、短命な Cookie で受け取る（research R7）。 */
export async function startSignUpConsent(agreed: boolean): Promise<ConsentActionResult> {
  if (!agreed) return { ok: false, code: "CONSENT_REQUIRED" };
  const store = await cookies();
  store.set(PENDING_CONSENT_COOKIE, pendingConsentValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_CONSENT_MAX_AGE_SECONDS,
  });
  return { ok: true };
}
