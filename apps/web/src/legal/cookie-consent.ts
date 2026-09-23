export const COOKIE_CONSENT_COOKIE = "cookie_consent";
export type CookieConsentChoice = "all" | "essential";

export function parseCookieConsent(value: string | undefined): CookieConsentChoice | null {
  return value === "all" || value === "essential" ? value : null;
}
