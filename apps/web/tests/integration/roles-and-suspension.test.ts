import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authEvents, eq, session, user } from "@app/db";
import { resolveAccess } from "@/auth/access-state";
import { setOperatorRole } from "@/auth/operator-role";
import { Browser, createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";

const PASSWORD = "correct-horse-battery-staple";

describe("ロールと停止（US6）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth();
  });
  afterAll(closeDb);

  it("サインアップしたアカウントは利用者かつ有効（FR-024）", async () => {
    await signUpAndVerify(t, "a@example.com");
    const [u] = await t.db.select().from(user);
    expect(u).toMatchObject({ role: "user", status: "active" });
  });

  it("運営者の画面は、利用者なら 404、運営者なら通る（FR-025）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    expect((await resolveAccess(t.auth, t.db, b.headers(), { requireOperator: true })).decision).toEqual({
      kind: "not-found",
    });
    expect(await setOperatorRole(t.db, "A@example.com", "operator")).toBe(true);
    expect((await resolveAccess(t.auth, t.db, b.headers(), { requireOperator: true })).decision).toEqual({
      kind: "ok",
    });
    expect(await setOperatorRole(t.db, "a@example.com", "user")).toBe(true);
    expect((await resolveAccess(t.auth, t.db, b.headers(), { requireOperator: true })).decision).toEqual({
      kind: "not-found",
    });
    expect(await setOperatorRole(t.db, "nobody@example.com", "operator")).toBe(false);
  });

  it("停止中のアカウントはログインできず、記録が残る（FR-026）", async () => {
    await signUpAndVerify(t, "a@example.com");
    await t.db.update(user).set({ status: "suspended" }).where(eq(user.email, "a@example.com"));
    const r = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "a@example.com",
      password: PASSWORD,
    });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("ACCOUNT_SUSPENDED");
    const events = await t.db.select().from(authEvents);
    expect(events.filter((e) => e.type === "sign_in_rejected_suspended")).toHaveLength(1);
    expect(events.filter((e) => e.type === "sign_in_failed")).toHaveLength(0);
  });

  it("ログイン中に停止されたら、次の操作でセッションを失効させる（US6-4）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    await t.db.update(user).set({ status: "suspended" }).where(eq(user.email, "a@example.com"));
    const r = await resolveAccess(t.auth, t.db, b.headers());
    expect(r.decision).toEqual({ kind: "suspended" });
    expect(await t.db.select().from(session)).toHaveLength(0);
    expect((await b.request("GET", "/get-session")).json).toBeNull();
  });
});
