import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { account, authEvents, createDb, outboundEmails, rateLimitBuckets, sql, user } from "@app/db";
import { DAY } from "@app/shared/time";
import {
  cleanupUnverifiedUsers,
  pruneAuthEvents,
  pruneOutboundEmails,
  pruneRateLimitBuckets,
} from "../src/jobs/cleanup";

const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
const { db, pool } = createDb(url, { max: 2 });
const now = new Date("2026-09-23T03:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

async function addUser(id: string, opts: { verified: boolean; createdAt: Date; google?: boolean }) {
  await db
    .insert(user)
    .values({ id, email: `${id}@example.com`, emailVerified: opts.verified, createdAt: opts.createdAt });
  await db.insert(account).values({
    id: `acc-${id}`,
    userId: id,
    providerId: opts.google ? "google" : "credential",
    accountId: id,
  });
}

describe("定期の掃除（R12）", () => {
  beforeEach(async () => {
    await db.execute(
      sql`truncate table auth_events, consents, outbound_emails, rate_limit_buckets, account, session, "user" cascade`,
    );
  });
  afterAll(() => pool.end());

  it("登録から 7 日を過ぎた未確認のアカウントだけを削除する（FR-003a）", async () => {
    await addUser("old-unverified", { verified: false, createdAt: ago(7 * DAY + 1000) });
    await addUser("new-unverified", { verified: false, createdAt: ago(6 * DAY) });
    await addUser("old-verified", { verified: true, createdAt: ago(30 * DAY) });
    await addUser("old-google", { verified: false, createdAt: ago(30 * DAY), google: true });
    const deleted = await cleanupUnverifiedUsers(db, now);
    expect(deleted).toBe(1);
    const ids = (await db.select({ id: user.id }).from(user)).map((u) => u.id).sort();
    expect(ids).toEqual(["new-unverified", "old-google", "old-verified"]);
  });

  it("90 日を過ぎた認証の記録を削除する（FR-031）", async () => {
    await db.insert(authEvents).values([
      { type: "sign_in_failed", occurredAt: ago(90 * DAY + 1000) },
      { type: "sign_in_failed", occurredAt: ago(89 * DAY) },
    ]);
    expect(await pruneAuthEvents(db, now)).toBe(1);
    expect(await db.select().from(authEvents)).toHaveLength(1);
  });

  it("30 日を過ぎたメールの記録を削除する", async () => {
    await db.insert(outboundEmails).values([
      { kind: "verify_email", createdAt: ago(30 * DAY + 1000) },
      { kind: "verify_email", createdAt: ago(29 * DAY) },
    ]);
    expect(await pruneOutboundEmails(db, now)).toBe(1);
  });

  it("期限を過ぎた試行の記録を削除する", async () => {
    await db.insert(rateLimitBuckets).values([
      { key: "sign-in:a", count: 1, windowStartedAt: ago(DAY), expiresAt: ago(1000) },
      { key: "sign-in:b", count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + 1000) },
    ]);
    expect(await pruneRateLimitBuckets(db, now)).toBe(1);
  });
});
