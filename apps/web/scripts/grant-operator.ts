/**
 * 運営者のロールの付与と取り消し（FR-027）。画面からは行えない。
 *   pnpm --filter @app/web ops:grant-operator <email>
 *   pnpm --filter @app/web ops:revoke-operator <email>
 */
import { createDb } from "@app/db";
import { setOperatorRole } from "../src/auth/operator-role";

async function main() {
  const [mode, email] = process.argv.slice(2);
  if ((mode !== "grant" && mode !== "revoke") || !email) {
    console.error("使い方: grant-operator.ts <grant|revoke> <email>");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL が設定されていない");
    process.exit(1);
  }
  const { db, pool } = createDb(url, { max: 1 });
  try {
    const ok = await setOperatorRole(db, email, mode === "grant" ? "operator" : "user");
    if (!ok) {
      console.error("指定したメールアドレスのアカウントが見つからない");
      process.exit(1);
    }
    console.log(mode === "grant" ? "運営者のロールを付与した" : "運営者のロールを取り消した");
  } finally {
    await pool.end();
  }
}

void main();
