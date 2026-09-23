import { readFile } from "node:fs/promises";
import type { Database } from "@app/db";
import { FIXTURE_FILE } from "./cli";
import { importRows } from "./load";
import { parseImportTsv } from "./tsv";

/** テスト用: 検証用データを取り込む。 */
export async function seedFixture(db: Database, asOf: string): Promise<void> {
  const parsed = parseImportTsv(await readFile(FIXTURE_FILE, "utf8"));
  if (parsed.errors.length > 0) throw new Error("検証用データにエラーがある");
  await importRows(db, parsed.rows, { asOf, mode: "full", source: "fixture" });
}
