import { describe, expect, it } from "vitest";
import { renderEmail, type EmailKind } from "../src/templates";

const kinds: EmailKind[] = [
  "verify_email",
  "reset_password",
  "reset_password_google_only",
  "change_email_verify",
  "change_email_notice",
];

describe("renderEmail", () => {
  it.each(kinds)("%s の文面にリンクを含める", (kind) => {
    const m = renderEmail({ kind, to: "a@example.com", url: "https://app.example.com/x?token=t1" });
    expect(m.to).toBe("a@example.com");
    expect(m.subject).toContain("ネーミングチェッカー");
    expect(m.text).toContain("https://app.example.com/x?token=t1");
    expect(m.html).toContain('href="https://app.example.com/x?token=t1"');
  });

  it("HTML の特殊文字をエスケープする", () => {
    const m = renderEmail({ kind: "verify_email", to: "a@example.com", url: 'https://x/"><script>' });
    expect(m.html).not.toContain("<script>");
  });
});
