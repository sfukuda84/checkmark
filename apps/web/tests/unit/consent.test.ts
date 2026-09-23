import { describe, expect, it } from "vitest";
import { CURRENT_VERSIONS, isValidPendingConsent, missingConsents, pendingConsentValue } from "@/legal/consent";

describe("missingConsents", () => {
  it("現行の版の同意がそろっていれば空を返す", () => {
    const records = [
      { document: "terms" as const, version: CURRENT_VERSIONS.terms },
      { document: "privacy" as const, version: CURRENT_VERSIONS.privacy },
    ];
    expect(missingConsents(records)).toEqual([]);
  });

  it("旧版だけなら、その文書を未同意とする（FR-019）", () => {
    const records = [
      { document: "terms" as const, version: "2000-01-01" },
      { document: "privacy" as const, version: CURRENT_VERSIONS.privacy },
    ];
    expect(missingConsents(records)).toEqual(["terms"]);
  });

  it("同意がなければ両方を返す", () => {
    expect(missingConsents([])).toEqual(["terms", "privacy"]);
  });
});

describe("pending_consent", () => {
  it("現行の版を表す値だけを有効とする（FR-017）", () => {
    expect(isValidPendingConsent(pendingConsentValue())).toBe(true);
    expect(isValidPendingConsent(undefined)).toBe(false);
    expect(isValidPendingConsent("")).toBe(false);
    expect(isValidPendingConsent("terms:2000-01-01|privacy:2000-01-01")).toBe(false);
  });
});
