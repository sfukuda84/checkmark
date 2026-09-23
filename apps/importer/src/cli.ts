import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createDb } from "@app/db";
import { importRows } from "./load";
import { parseImportTsv } from "./tsv";

/** 取り込み CLI（contracts/jobs-and-cli.md §3）。商標データは公開の情報なので、件数と行番号はそのまま出してよい。 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_FILE = path.resolve(here, "../fixtures/sample-trademarks.tsv");

/** 日本時間の今日（YYYY-MM-DD）。 */
function todayInTokyo(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export async function runImport(options: {
  databaseUrl: string;
  file: string;
  asOf: string;
  mode: "full" | "delta";
  source: string;
}): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) throw new Error(`--as-of は YYYY-MM-DD で指定する: ${options.asOf}`);
  const parsed = parseImportTsv(await readFile(options.file, "utf8"));
  if (parsed.errors.length > 0) {
    for (const e of parsed.errors.slice(0, 20)) process.stderr.write(`${e.line} 行目: ${e.message}\n`);
    throw new Error(`取り込み用 TSV に ${parsed.errors.length} 件のエラーがある`);
  }
  const { db, pool } = createDb(options.databaseUrl, { max: 2 });
  try {
    const result = await importRows(db, parsed.rows, {
      asOf: options.asOf,
      mode: options.mode,
      source: options.source,
    });
    return result.rowCount;
  } finally {
    await pool.end();
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL が設定されていない");
  const { values } = parseArgs({
    args: rest.filter((a) => a !== "--"),
    options: {
      file: { type: "string" },
      "as-of": { type: "string" },
      mode: { type: "string", default: "full" },
      source: { type: "string", default: "jpo-bulk" },
    },
  });
  if (values.mode !== "full" && values.mode !== "delta") throw new Error("--mode は full か delta で指定する");

  let count: number;
  if (command === "import") {
    if (!values.file || !values["as-of"]) throw new Error("--file と --as-of を指定する");
    count = await runImport({
      databaseUrl,
      file: values.file,
      asOf: values["as-of"],
      mode: values.mode,
      source: values.source,
    });
  } else if (command === "seed-fixture") {
    count = await runImport({
      databaseUrl,
      file: FIXTURE_FILE,
      asOf: values["as-of"] ?? todayInTokyo(),
      mode: "full",
      source: "fixture",
    });
  } else {
    throw new Error("使い方: import --file <path.tsv> --as-of <YYYY-MM-DD> [--mode full|delta] | seed-fixture");
  }
  process.stdout.write(`商標データを取り込んだ（${count} 行）\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`取り込みに失敗した: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
