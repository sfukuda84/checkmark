import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LegalDocument } from "@app/db";
import { CURRENT_VERSIONS } from "./registry";

/** 規約の本文（Markdown）を読む。 */
export async function readLegalDocument(doc: LegalDocument, version = CURRENT_VERSIONS[doc]): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error("版の形式が不正である");
  return readFile(path.join(process.cwd(), "content", "legal", doc, `${version}.md`), "utf8");
}
