import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { consents, eq, user } from "@app/db";
import { resolveAccess } from "@/auth/access-state";
import { acceptConsentFor } from "@/legal/accept";
import { CURRENT_VERSIONS } from "@/legal/registry";
import { createTestAuth, signUpAndVerify } from "../helpers/auth-harness";
import { closeDb, resetDb } from "../helpers/db";

describe("規約の改定と再同意（US5）", () => {
  let t: ReturnType<typeof createTestAuth>;
  beforeEach(async () => {
    await resetDb();
    t = createTestAuth();
  });
  afterAll(closeDb);

  it("現行の版に同意していれば通る", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    const r = await resolveAccess(t.auth, t.db, b.headers());
    expect(r.decision).toEqual({ kind: "ok" });
  });

  it("旧版にだけ同意した利用者は、同意の画面へ移される（FR-019）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    const [u] = await t.db.select().from(user);
    await t.db.update(consents).set({ version: "2000-01-01" }).where(eq(consents.document, "terms"));
    const r = await resolveAccess(t.auth, t.db, b.headers());
    expect(r.decision).toEqual({ kind: "redirect", to: "/consent" });
    const onConsentPage = await resolveAccess(t.auth, t.db, b.headers(), { allowWithoutConsent: true });
    expect(onConsentPage.decision).toEqual({ kind: "ok" });
    expect(u).toBeDefined();
  });

  it("同意すると現行の版が記録され、通れるようになる（FR-020）", async () => {
    const b = await signUpAndVerify(t, "a@example.com");
    const [u] = await t.db.select().from(user);
    await t.db.delete(consents).where(eq(consents.userId, u!.id));
    await t.db.insert(consents).values([
      { userId: u!.id, document: "terms", version: "2000-01-01" },
      { userId: u!.id, document: "privacy", version: "2000-01-01" },
    ]);
    const result = await acceptConsentFor(t.db, u!.id, {
      terms: CURRENT_VERSIONS.terms,
      privacy: CURRENT_VERSIONS.privacy,
    });
    expect(result).toEqual({ ok: true });
    const rows = await t.db.select().from(consents).where(eq(consents.userId, u!.id));
    expect(rows.map((r) => `${r.document}:${r.version}`).sort()).toEqual(
      [
        "privacy:2000-01-01",
        `privacy:${CURRENT_VERSIONS.privacy}`,
        "terms:2000-01-01",
        `terms:${CURRENT_VERSIONS.terms}`,
      ].sort(),
    );
    expect((await resolveAccess(t.auth, t.db, b.headers())).decision).toEqual({ kind: "ok" });
  });

  it("画面を開いた後に版が変わっていたら CONSENT_OUTDATED にする", async () => {
    await signUpAndVerify(t, "a@example.com");
    const [u] = await t.db.select().from(user);
    const result = await acceptConsentFor(t.db, u!.id, { terms: "1999-01-01", privacy: CURRENT_VERSIONS.privacy });
    expect(result).toEqual({ ok: false, code: "CONSENT_OUTDATED" });
  });
});
