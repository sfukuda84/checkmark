import { getDb } from "@app/db";
import { createPgBossEnqueuer } from "@/jobs/client";
import { createAuth, type Auth } from "./auth";
import { createPwnedPasswordChecker } from "./pwned";
import { AccountRateLimiter, createDbBucketStore } from "./rate-limit";

let instance: Auth | undefined;

/** アプリで使う Better Auth のインスタンス。 */
export function getAuth(): Auth {
  if (!instance) {
    const db = getDb();
    instance = createAuth({
      db,
      mailer: createPgBossEnqueuer(db),
      pwned: createPwnedPasswordChecker(),
      limiter: new AccountRateLimiter(createDbBucketStore(db)),
    });
  }
  return instance;
}
