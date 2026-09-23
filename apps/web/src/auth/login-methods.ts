import { account, eq, type Database } from "@app/db";
import type { AccountLike } from "./account-policy";

/** アカウントのログイン手段（credential / google）の一覧。 */
export function getLoginMethods(db: Database, userId: string): Promise<AccountLike[]> {
  return db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
}
