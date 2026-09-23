import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  account,
  authEvents,
  checkCandidates,
  checks,
  consents,
  eq,
  outboundEmails,
  session,
  trademarkResults,
  usageCounters,
  user,
  verification,
} from "@app/db";
import { recordingSender } from "../helpers/checks";
import { startCheck } from "@/checks/start-check";
import { MINUTE } from "@app/shared/time";
import { reauthenticateWithPassword } from "@/auth/reauth";
import { Browser, createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";
import { mockGoogleTokenEndpoint, signInWithGoogle } from "../helpers/google";

const PASSWORD = "correct-horse-battery-staple";

describe("メールアドレスの変更と退会（US4）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth({ google: true });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(closeDb);

  /** ログインから 10 分を過ぎた状態にする（ログイン直後の再認証の扱いを外す）。 */
  const staleSession = () => t.clock.advance(11 * MINUTE);

  it("再認証なしでは、メールアドレスの変更も退会もできない", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    staleSession();
    const change = await b.request("POST", "/change-email", { newEmail: "b@example.com", callbackURL: "/account" });
    expect(change.json.code).toBe("REAUTH_REQUIRED");
    const del = await b.request("POST", "/delete-user", {});
    expect(del.json.code).toBe("REAUTH_REQUIRED");
    expect(await t.db.select().from(user)).toHaveLength(1);
  });

  it("再認証に失敗したら、何も変わらない", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    staleSession();
    const r = await reauthenticateWithPassword(t.auth, t.db, b.headers(), "wrong-password-x", t.clock);
    expect(r).toEqual({ ok: false, code: "INVALID_PASSWORD" });
    const change = await b.request("POST", "/change-email", { newEmail: "b@example.com" });
    expect(change.json.code).toBe("REAUTH_REQUIRED");
  });

  it("再認証の後、新しいアドレスの確認を経てメールアドレスが変わり、古いアドレスに通知が出る（FR-012、FR-013）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    staleSession();
    expect(await reauthenticateWithPassword(t.auth, t.db, b.headers(), PASSWORD, t.clock)).toEqual({ ok: true });
    const r = await b.request("POST", "/change-email", { newEmail: "b@example.com", callbackURL: "/account" });
    expect(r.status).toBe(200);
    // 確認の前は古いアドレスのまま
    expect((await t.db.select().from(user))[0]!.email).toBe("a@example.com");
    const mail = t.mailbox.last("change_email_verify");
    expect(mail.to).toBe("b@example.com");
    await b.open(mail.url);
    expect((await t.db.select().from(user))[0]!.email).toBe("b@example.com");
    expect(t.mailbox.last("change_email_notice").to).toBe("a@example.com");
    expect((await t.db.select().from(authEvents)).some((e) => e.type === "email_changed")).toBe(true);
    const signIn = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "b@example.com",
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
  });

  it("使われているアドレスへの変更は反映されず、存在も分からない（FR-014）", async () => {
    await signUpAndVerify(t, "taken@example.com");
    const b = await signUpAndVerify(t, "a@example.com");
    const r = await b.request("POST", "/change-email", { newEmail: "taken@example.com" });
    expect(r.status).toBe(200);
    expect(t.mailbox.sent.filter((m) => m.kind === "change_email_verify")).toHaveLength(0);
    const emails = (await t.db.select().from(user)).map((u) => u.email).sort();
    expect(emails).toEqual(["a@example.com", "taken@example.com"]);
  });

  it("Google だけのアカウントはメールアドレスを変えられない（FR-012a）", async () => {
    mockGoogleTokenEndpoint({ sub: "g-1", email: "g@example.com", email_verified: true });
    const g = new Browser(t.auth);
    g.agreeToTerms();
    await signInWithGoogle(g);
    const r = await g.request("POST", "/change-email", { newEmail: "other@example.com" });
    expect(r.json.code).toBe("EMAIL_CHANGE_NOT_ALLOWED");
    const set = await reauthenticateWithPassword(t.auth, t.db, g.headers(), "anything-goes-here", t.clock);
    expect(set.ok).toBe(false);
  });

  it("退会すると本人のデータがすべて消え、認証の記録は本人と結びつかなくなる（FR-016、FR-032）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    const [u] = await t.db.select().from(user);
    await t.db
      .insert(verification)
      .values({ id: "v-1", identifier: "reset-password:x", value: u!.id, expiresAt: new Date(Date.now() + 60_000) });
    // 001: チェック、候補、結果、利用回数も消える（FR-033、NFR-DA-004）
    const started = await startCheck(t.db, recordingSender().sender, {
      userId: u!.id,
      input: "秘密の候補",
      classes: [],
      now: new Date(),
    });
    if (!started.ok) throw new Error("チェックを作れなかった");
    const [cand] = await t.db.select().from(checkCandidates);
    await t.db.insert(trademarkResults).values({ candidateId: cand!.id, outcome: "none" });
    staleSession();
    await reauthenticateWithPassword(t.auth, t.db, b.headers(), PASSWORD, t.clock);
    const r = await b.request("POST", "/delete-user", {});
    expect(r.status).toBe(200);
    expect(await t.db.select().from(user)).toHaveLength(0);
    expect(await t.db.select().from(checks)).toHaveLength(0);
    expect(await t.db.select().from(checkCandidates)).toHaveLength(0);
    expect(await t.db.select().from(trademarkResults)).toHaveLength(0);
    expect(await t.db.select().from(usageCounters)).toHaveLength(0);
    expect(await t.db.select().from(session)).toHaveLength(0);
    expect(await t.db.select().from(account)).toHaveLength(0);
    expect(await t.db.select().from(consents)).toHaveLength(0);
    expect(await t.db.select().from(outboundEmails)).toHaveLength(0);
    expect(await t.db.select().from(verification).where(eq(verification.value, u!.id))).toHaveLength(0);
    const events = await t.db.select().from(authEvents);
    expect(events.some((e) => e.type === "account_deleted")).toBe(true);
    expect(events.every((e) => e.userId === null)).toBe(true);
    expect(
      (await new Browser(t.auth).request("POST", "/sign-in/email", { email: "a@example.com", password: PASSWORD }))
        .status,
    ).toBe(401);
  });

  it("Google だけのアカウントは、ログインし直した直後なら退会できる", async () => {
    mockGoogleTokenEndpoint({ sub: "g-2", email: "g2@example.com", email_verified: true });
    const g = new Browser(t.auth);
    g.agreeToTerms();
    await signInWithGoogle(g);
    const r = await g.request("POST", "/delete-user", {});
    expect(r.status).toBe(200);
    expect(await t.db.select().from(user)).toHaveLength(0);
  });
});
