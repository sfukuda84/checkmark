import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findOwnedCheck, listRecentChecks } from "@/checks/repository";
import { retryCandidate } from "@/checks/retry";
import { closeDb, resetDb, testDb } from "../helpers/db";
import { addUser, insertCheck, recordingSender } from "../helpers/checks";

describe("チェックの認可（FR-030、SC-005、憲章 II）", () => {
  beforeEach(async () => {
    await resetDb();
    await addUser("owner");
    await addUser("other");
    await addUser("op", "operator");
  });
  afterAll(closeDb);

  it("本人だけがチェックを読み出せる。ほかの利用者と運営者には見つからない", async () => {
    const { check } = await insertCheck("owner", ["done"]);
    expect(await findOwnedCheck(testDb(), "owner", check.id)).not.toBeNull();
    expect(await findOwnedCheck(testDb(), "other", check.id)).toBeNull();
    expect(await findOwnedCheck(testDb(), "op", check.id)).toBeNull();
  });

  it("形式の正しくない ID は見つからない扱いにする", async () => {
    expect(await findOwnedCheck(testDb(), "owner", "not-a-uuid")).toBeNull();
  });

  it("直近のチェックの一覧には本人のものだけが出る", async () => {
    await insertCheck("owner", ["done"]);
    await insertCheck("other", ["done"]);
    expect(await listRecentChecks(testDb(), "other")).toHaveLength(1);
    expect(await listRecentChecks(testDb(), "op")).toHaveLength(0);
  });

  it("ほかの利用者の候補はやり直せない", async () => {
    const { candidates } = await insertCheck("owner", ["unknown"]);
    const r = await retryCandidate(testDb(), recordingSender().sender, {
      userId: "other",
      candidateId: candidates[0]!.id,
      now: new Date(),
    });
    expect(r).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
