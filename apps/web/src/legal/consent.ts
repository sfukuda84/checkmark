import { LEGAL_DOCUMENTS, type LegalDocument } from "@app/db";
import { CURRENT_VERSIONS } from "./registry";

export { CURRENT_VERSIONS };

export const PENDING_CONSENT_COOKIE = "pending_consent";
export const PENDING_CONSENT_MAX_AGE_SECONDS = 600;

export interface ConsentRecord {
  document: LegalDocument;
  version: string;
}

/** 現行の版に同意していない文書を返す（FR-019）。 */
export function missingConsents(records: ConsentRecord[]): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter(
    (doc) => !records.some((r) => r.document === doc && r.version === CURRENT_VERSIONS[doc]),
  );
}

/** サインアップの前の同意を表す Cookie の値（research R7）。現行の版を並べる。 */
export function pendingConsentValue(): string {
  return LEGAL_DOCUMENTS.map((doc) => `${doc}:${CURRENT_VERSIONS[doc]}`).join("|");
}

export function isValidPendingConsent(value: string | undefined | null): boolean {
  return !!value && value === pendingConsentValue();
}

/** Cookie ヘッダーから値を取り出す。 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
