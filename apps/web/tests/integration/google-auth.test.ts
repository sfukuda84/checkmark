import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, consents, eq, user } from "@app/db";
import { Browser, createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";
import { mockGoogleTokenEndpoint, signInWithGoogle } from "../helpers/google";

describe("Google での登録とログイン（US2）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth({ google: true });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(closeDb);

  it("同意してから Google で登録すると、アカウントと同意の履歴ができる（FR-005、FR-017）", async () => {
    mockGoogleTokenEndpoint({ sub: "g-1", email: "g@example.com", email_verified: true, name: "G" });
    const b = new Browser(t.auth);
    b.agreeToTerms();
    const r = await signInWithGoogle(b);
    expect(r.status).toBe(302);
    expect(r.location).not.toContain("error");
    const [u] = await t.db.select().from(user);
    expect(u).toMatchObject({ email: "g@example.com", emailVerified: true });
    expect(await t.db.select().from(consents).where(eq(consents.userId, u!.id))).toHaveLength(2);
    expect(b.hasSession()).toBe(true);
  });

  it("同意なしの新規登録は作らず、エラーの戻り先に移す（FR-017）", async () => {
    mockGoogleTokenEndpoint({ sub: "g-2", email: "new@example.com", email_verified: true });
    const b = new Browser(t.auth);
    const r = await signInWithGoogle(b, { errorCallbackURL: "/sign-up?error=google" });
    expect(r.location).toContain("/sign-up");
    expect(r.location).toContain("error");
    expect(await t.db.select().from(user)).toHaveLength(0);
    expect(b.hasSession()).toBe(false);
  });

  it("登録済みの Google の利用者は、同意の Cookie なしでログインできる", async () => {
    mockGoogleTokenEndpoint({ sub: "g-3", email: "g3@example.com", email_verified: true });
    const first = new Browser(t.auth);
    first.agreeToTerms();
    await signInWithGoogle(first);
    const again = new Browser(t.auth);
    const r = await signInWithGoogle(again);
    expect(r.location).not.toContain("error");
    expect(again.hasSession()).toBe(true);
  });

  it("Google 側で確認済みの同じアドレスなら、既存のアカウントに結びつける（FR-005a）", async () => {
    await signUpAndVerify(t, "same@example.com");
    mockGoogleTokenEndpoint({ sub: "g-4", email: "same@example.com", email_verified: true });
    const b = new Browser(t.auth);
    const r = await signInWithGoogle(b);
    expect(r.location).not.toContain("error");
    expect(await t.db.select().from(user)).toHaveLength(1);
    const providers = (await t.db.select().from(account)).map((a) => a.providerId).sort();
    expect(providers).toEqual(["credential", "google"]);
  });

  it("Google 側で確認されていないアドレスは結びつけない（FR-005a）", async () => {
    await signUpAndVerify(t, "unverified@example.com");
    mockGoogleTokenEndpoint({ sub: "g-5", email: "unverified@example.com", email_verified: false });
    const b = new Browser(t.auth);
    const r = await signInWithGoogle(b);
    expect(r.location).toContain("error");
    const providers = (await t.db.select().from(account)).map((a) => a.providerId);
    expect(providers).toEqual(["credential"]);
    expect(b.hasSession()).toBe(false);
  });
});
