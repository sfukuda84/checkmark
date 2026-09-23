import type { LegalDocument } from "@app/db";

/**
 * 利用規約とプライバシーポリシーの現行の版（research R7）。
 * 改定するときは、content/legal/<文書>/<版>.md を足し、ここの版を変える。
 */
export const CURRENT_VERSIONS: Record<LegalDocument, string> = {
  terms: "2026-09-23",
  privacy: "2026-09-23",
};

export const DOCUMENT_TITLES: Record<LegalDocument, string> = {
  terms: "利用規約",
  privacy: "プライバシーポリシー",
};
