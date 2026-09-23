import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { session } from "@app/db";
import { DAY } from "@app/shared/time";
import { createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";

describe("ログイン状態の期間（FR-008a）", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("作成から 30 日で期限が切れる", async () => {
    const t = createTestAuth();
    await signUpAndVerify(t, "a@example.com");
    const [s] = await t.db.select().from(session);
    const lifetime = s!.expiresAt.getTime() - s!.createdAt.getTime();
    expect(Math.abs(lifetime - 30 * DAY)).toBeLessThan(60_000);
  });
});
