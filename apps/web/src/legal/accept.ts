import { consents, LEGAL_DOCUMENTS, type Database, type LegalDocument } from "@app/db";
import { CURRENT_VERSIONS } from "./registry";

export type AcceptResult = { ok: true } | { ok: false; code: "CONSENT_OUTDATED" };

/**
 * 画面に表示した版への同意を記録する（FR-020）。
 * 画面を開いた後に版が変わっていたら、記録せずに CONSENT_OUTDATED を返す。
 */
export async function acceptConsentFor(
  db: Database,
  userId: string,
  shown: Record<LegalDocument, string>,
): Promise<AcceptResult> {
  if (LEGAL_DOCUMENTS.some((doc) => shown[doc] !== CURRENT_VERSIONS[doc]))
    return { ok: false, code: "CONSENT_OUTDATED" };
  await db
    .insert(consents)
    .values(LEGAL_DOCUMENTS.map((document) => ({ userId, document, version: CURRENT_VERSIONS[document] })))
    .onConflictDoNothing();
  return { ok: true };
}
