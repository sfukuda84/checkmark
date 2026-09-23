import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authEvents, session } from "@app/db";
import { HOUR } from "@app/shared/time";
import { Browser, createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";
import { mockGoogleTokenEndpoint, signInWithGoogle } from "../helpers/google";

const OLD = "correct-horse-battery-staple";
const NEW = "a-brand-new-long-passphrase";

async function requestReset(b: Browser, email: string) {
  return b.request("POST", "/request-password-reset", { email, redirectTo: "/reset-password" });
}

/** メールのリンクを開き、リダイレクト先の token を取り出す。 */
async function tokenFromResetMail(b: Browser, url: string): Promise<string> {
  const r = await b.open(url);
  const location = r.res.headers.get("location")!;
  return new URL(location, "http://localhost:3000").searchParams.get("token")!;
}

describe("パスワードの再設定（US3）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth({ google: true });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(closeDb);

  it("登録の有無によらず同じ応答を返す（FR-009）", async () => {
    await signUpAndVerify(t, "a@example.com");
    const known = await requestReset(new Browser(t.auth), "a@example.com");
    const unknown = await requestReset(new Browser(t.auth), "nobody@example.com");
    expect(known.status).toBe(unknown.status);
    expect(known.json).toEqual(unknown.json);
    expect(t.mailbox.sent.filter((m) => m.kind === "reset_password")).toHaveLength(1);
  });

  it("新しいパスワードを設定でき、ほかのセッションは失効する（FR-011）", async () => {
    const other = await signUpAndVerify(t, "a@example.com", OLD);
    await requestReset(new Browser(t.auth), "a@example.com");
    const b = new Browser(t.auth);
    const token = await tokenFromResetMail(b, t.mailbox.last("reset_password").url);
    const r = await b.request("POST", "/reset-password", { newPassword: NEW, token });
    expect(r.status).toBe(200);
    expect(await t.db.select().from(session)).toHaveLength(0);
    expect((await other.request("GET", "/get-session")).json).toBeNull();
    expect(
      (await new Browser(t.auth).request("POST", "/sign-in/email", { email: "a@example.com", password: OLD })).status,
    ).toBe(401);
    expect(
      (await new Browser(t.auth).request("POST", "/sign-in/email", { email: "a@example.com", password: NEW })).status,
    ).toBe(200);
    expect((await t.db.select().from(authEvents)).some((e) => e.type === "password_reset")).toBe(true);
  });

  it("リンクは 1 回だけ使える（FR-010）", async () => {
    await signUpAndVerify(t, "a@example.com");
    await requestReset(new Browser(t.auth), "a@example.com");
    const b = new Browser(t.auth);
    const token = await tokenFromResetMail(b, t.mailbox.last("reset_password").url);
    expect((await b.request("POST", "/reset-password", { newPassword: NEW, token })).status).toBe(200);
    const again = await b.request("POST", "/reset-password", { newPassword: "yet-another-passphrase", token });
    expect(again.status).toBe(400);
  });

  it("リンクの期限は 1 時間（FR-010）", async () => {
    await signUpAndVerify(t, "a@example.com");
    await requestReset(new Browser(t.auth), "a@example.com");
    const url = t.mailbox.last("reset_password").url;
    const b = new Browser(t.auth);
    const token = await tokenFromResetMail(b, url);
    vi.useFakeTimers({ now: Date.now() + HOUR + 1000, toFake: ["Date"] });
    const r = await b.request("POST", "/reset-password", { newPassword: NEW, token });
    vi.useRealTimers();
    expect(r.status).toBe(400);
  });

  it("漏えいパスワードには再設定できない（FR-002）", async () => {
    await signUpAndVerify(t, "a@example.com");
    await requestReset(new Browser(t.auth), "a@example.com");
    const b = new Browser(t.auth);
    const token = await tokenFromResetMail(b, t.mailbox.last("reset_password").url);
    const r = await b.request("POST", "/reset-password", { newPassword: "password123", token });
    expect(r.json.code).toBe("PASSWORD_COMPROMISED");
  });

  it("Google だけのアカウントには、再設定のリンクの代わりにログインの案内を送る", async () => {
    mockGoogleTokenEndpoint({ sub: "g-1", email: "g@example.com", email_verified: true });
    const g = new Browser(t.auth);
    g.agreeToTerms();
    await signInWithGoogle(g);
    const r = await requestReset(new Browser(t.auth), "g@example.com");
    expect(r.status).toBe(200);
    expect(t.mailbox.sent.filter((m) => m.kind === "reset_password")).toHaveLength(0);
    const mail = t.mailbox.last("reset_password_google_only", "g@example.com");
    expect(mail.url).toBe("http://localhost:3000/sign-in");
  });

  it("再設定の依頼も 15 分に 10 回まで（FR-008）", async () => {
    for (let i = 0; i < 10; i++) expect((await requestReset(new Browser(t.auth), "a@example.com")).status).toBe(200);
    const blocked = await requestReset(new Browser(t.auth), "a@example.com");
    expect(blocked.json.code).toBe("TOO_MANY_ATTEMPTS");
  });
});
