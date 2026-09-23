import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findOwnedCheck, listRecentChecks } from "@/checks/repository";
import { closeDb, resetDb, testDb } from "../helpers/db";
import { addUser, insertCheck } from "../helpers/checks";

describe("直近のチェック（FR-022）と結果の読み出し", () => {
  beforeEach(async () => {
    await resetDb();
    await addUser("u1");
  });
  afterAll(closeDb);

  it("新しい順に 5 件まで、候補数と完了件数を添えて返す", async () => {
    const base = new Date("2026-09-20T00:00:00Z").getTime();
    for (let i = 0; i < 6; i++)
      await insertCheck("u1", i === 5 ? ["done", "queued", "unknown"] : ["done"], new Date(base + i * 60_000));
    const list = await listRecentChecks(testDb(), "u1");
    expect(list).toHaveLength(5);
    expect(list[0]).toMatchObject({ total: 3, completed: 2, running: true });
    expect(list[1]).toMatchObject({ total: 1, completed: 1, running: false });
    expect(list.map((c) => c.createdAt.getTime())).toEqual([5, 4, 3, 2, 1].map((i) => base + i * 60_000));
  });

  it("findOwnedCheck は候補を並び順に、結果とともに返す", async () => {
    const { check } = await insertCheck("u1", ["done", "queued"]);
    const found = await findOwnedCheck(testDb(), "u1", check.id);
    expect(found!.candidates.map((c) => [c.position, c.status, c.result])).toEqual([
      [0, "done", null],
      [1, "queued", null],
    ]);
    expect(found!.running).toBe(true);
  });
});
