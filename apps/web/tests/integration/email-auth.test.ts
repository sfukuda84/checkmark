import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authEvents, consents, eq, user } from "@app/db";
import { MINUTE } from "@app/shared/time";
import { CURRENT_VERSIONS } from "@/legal/registry";
import { Browser, createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";

const PASSWORD = "correct-horse-battery-staple";

describe("メールアドレスとパスワードでの登録とログイン（US1）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth();
  });
  afterAll(closeDb);

  it("同意しないとアカウントを作らない（FR-017）", async () => {
    const b = new Browser(t.auth);
    const r = await b.request("POST", "/sign-up/email", { email: "a@example.com", password: PASSWORD, name: "" });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONSENT_REQUIRED");
    expect(await t.db.select().from(user)).toHaveLength(0);
  });

  it("漏えいパスワードと 8 文字未満を拒む（FR-002）", async () => {
    const b = new Browser(t.auth);
    b.agreeToTerms();
    const leaked = await b.request("POST", "/sign-up/email", {
      email: "a@example.com",
      password: "password123",
      name: "",
    });
    expect(leaked.json.code).toBe("PASSWORD_COMPROMISED");
    const short = await b.request("POST", "/sign-up/email", { email: "a@example.com", password: "short", name: "" });
    expect(short.json.code).toBe("PASSWORD_TOO_SHORT");
    expect(await t.db.select().from(user)).toHaveLength(0);
  });

  it("サインアップすると確認メールが登録され、同意が記録される（FR-003、FR-020）", async () => {
    const b = new Browser(t.auth);
    b.agreeToTerms();
    const r = await b.request("POST", "/sign-up/email", { email: "A@Example.com", password: PASSWORD, name: "" });
    expect(r.status).toBe(200);
    const mail = t.mailbox.last("verify_email");
    expect(mail.to).toBe("a@example.com");
    expect(mail.url).toContain("callbackURL=%2Fverify-email%2Fcallback");
    const [u] = await t.db.select().from(user);
    expect(u).toMatchObject({ email: "a@example.com", emailVerified: false, role: "user", status: "active" });
    const cs = await t.db.select().from(consents).where(eq(consents.userId, u!.id));
    expect(cs.map((c) => `${c.document}:${c.version}`).sort()).toEqual(
      [`privacy:${CURRENT_VERSIONS.privacy}`, `terms:${CURRENT_VERSIONS.terms}`].sort(),
    );
    // 確認前はセッションを持たない
    expect(b.hasSession()).toBe(false);
  });

  it("確認前はログインできず、確認後はログインできる（FR-003、FR-006）", async () => {
    const b = new Browser(t.auth);
    b.agreeToTerms();
    await b.request("POST", "/sign-up/email", { email: "a@example.com", password: PASSWORD, name: "" });
    const before = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "a@example.com",
      password: PASSWORD,
    });
    expect(before.status).toBe(403);
    expect(before.json.code).toBe("EMAIL_NOT_VERIFIED");

    await b.open(t.mailbox.last("verify_email").url);
    const after = new Browser(t.auth);
    const ok = await after.request("POST", "/sign-in/email", { email: "a@example.com", password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(after.hasSession()).toBe(true);
    const events = await t.db.select().from(authEvents);
    expect(events.some((e) => e.type === "sign_in_succeeded")).toBe(true);
  });

  it("失敗の応答からアカウントの有無が分からない（FR-007）", async () => {
    await signUpAndVerify(t, "a@example.com");
    const wrong = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "a@example.com",
      password: "wrong-password-x",
    });
    const missing = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "nobody@example.com",
      password: "wrong-password-x",
    });
    expect(wrong.status).toBe(missing.status);
    expect(wrong.json.code).toBe(missing.json.code);
    const failed = (await t.db.select().from(authEvents)).filter((e) => e.type === "sign_in_failed");
    expect(failed).toHaveLength(2);
    expect(failed.filter((e) => e.userId === null)).toHaveLength(1);
  });

  it("同じアカウントへのログインの試行は 15 分に 10 回まで（FR-008）", async () => {
    await signUpAndVerify(t, "a@example.com");
    for (let i = 0; i < 10; i++) {
      const r = await new Browser(t.auth, `198.51.100.${i}`).request("POST", "/sign-in/email", {
        email: "a@example.com",
        password: "wrong-password-x",
      });
      expect(r.status).toBe(401);
    }
    const blocked = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "a@example.com",
      password: PASSWORD,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.json.code).toBe("TOO_MANY_ATTEMPTS");
    t.clock.advance(15 * MINUTE);
    const ok = await new Browser(t.auth).request("POST", "/sign-in/email", {
      email: "a@example.com",
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
  });

  it("確認メールの送り直しは 1 時間に 3 回まで（FR-004）", async () => {
    const b = new Browser(t.auth);
    b.agreeToTerms();
    await b.request("POST", "/sign-up/email", { email: "a@example.com", password: PASSWORD, name: "" });
    for (let i = 0; i < 3; i++) {
      const r = await b.request("POST", "/send-verification-email", { email: "a@example.com" });
      expect(r.status).toBe(200);
    }
    const blocked = await b.request("POST", "/send-verification-email", { email: "a@example.com" });
    expect(blocked.json.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("ログアウトするとセッションがなくなる", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    expect(b.hasSession()).toBe(true);
    await b.request("POST", "/sign-out", {});
    const s = await b.request("GET", "/get-session");
    expect(s.json).toBeNull();
  });

  it("同じアドレスで二重に登録しても、存在が分かる応答にならない", async () => {
    await signUpAndVerify(t, "a@example.com");
    const b = new Browser(t.auth);
    b.agreeToTerms();
    const r = await b.request("POST", "/sign-up/email", {
      email: "a@example.com",
      password: "another-strong-passphrase",
      name: "",
    });
    expect(r.status).toBe(200);
    expect(await t.db.select().from(user)).toHaveLength(1);
  });
});
