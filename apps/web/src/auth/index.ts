import { getDb } from "@app/db";
import { createPgBossEnqueuer } from "@/jobs/client";
import { createAuth, type Auth } from "./auth";
import { createPwnedPasswordChecker, createStaticPwnedChecker } from "./pwned";
import { AccountRateLimiter, createDbBucketStore } from "./rate-limit";

let instance: Auth | undefined;

/** アプリで使う Better Auth のインスタンス。 */
export function getAuth(): Auth {
  if (!instance) {
    const db = getDb();
    instance = createAuth({
      db,
      mailer: createPgBossEnqueuer(db),
      // E2E テストでは外部に問い合わせず、固定の一覧で判定する（PWNED_CHECK=static）。
      pwned: process.env.PWNED_CHECK === "static" ? createStaticPwnedChecker() : createPwnedPasswordChecker(),
      limiter: new AccountRateLimiter(createDbBucketStore(db)),
    });
  }
  return instance;
}
