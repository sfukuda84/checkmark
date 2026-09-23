import { and, authEvents, eq, lt, outboundEmails, rateLimitBuckets, sql, user, type Database } from "@app/db";
import { DAY } from "@app/shared/time";

/** 登録から 7 日を過ぎても確認が済まず、Google のログイン手段を持たないアカウントを削除する（FR-003a）。 */
export async function cleanupUnverifiedUsers(db: Database, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - 7 * DAY);
  const rows = await db
    .delete(user)
    .where(
      and(
        eq(user.emailVerified, false),
        lt(user.createdAt, threshold),
        sql`not exists (select 1 from account a where a.user_id = ${user.id} and a.provider_id = 'google')`,
      ),
    )
    .returning({ id: user.id });
  return rows.length;
}

/** 90 日を過ぎた認証の記録を削除する（FR-031）。 */
export async function pruneAuthEvents(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(authEvents)
    .where(lt(authEvents.occurredAt, new Date(now.getTime() - 90 * DAY)))
    .returning({ id: authEvents.id });
  return rows.length;
}

/** 30 日を過ぎたメールの記録を削除する（data-model §9）。 */
export async function pruneOutboundEmails(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(outboundEmails)
    .where(lt(outboundEmails.createdAt, new Date(now.getTime() - 30 * DAY)))
    .returning({ id: outboundEmails.id });
  return rows.length;
}

/** 期限を過ぎた、アカウントごとの試行の記録を削除する。 */
export async function pruneRateLimitBuckets(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, now))
    .returning({ key: rateLimitBuckets.key });
  return rows.length;
}
