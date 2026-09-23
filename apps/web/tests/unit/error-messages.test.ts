import { describe, expect, it } from "vitest";
import { errorMessage, inputReasonMessage, safeNextPath } from "@/lib/error-messages";

describe("errorMessage", () => {
  it("知らないコードには汎用の文言を返す", () => {
    expect(errorMessage("SOMETHING")).toContain("処理に失敗しました");
    expect(errorMessage(undefined)).toContain("処理に失敗しました");
  });
  it("プロトタイプのキー（__proto__ など）には汎用の文言を返す", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(typeof errorMessage(code)).toBe("string");
      expect(errorMessage(code)).toBe("処理に失敗しました。時間をおいてもう一度お試しください。");
    }
    expect(inputReasonMessage("__proto__")).toBe("入力を直してください");
  });

  it("ログインの失敗は、どちらが誤りかを示さない（FR-007）", () => {
    expect(errorMessage("INVALID_EMAIL_OR_PASSWORD")).toBe("メールアドレスまたはパスワードが正しくありません。");
  });
});

describe("safeNextPath", () => {
  it("サイト内のパスだけを通す", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("https://evil.example.com")).toBe("/");
    expect(safeNextPath("//evil.example.com")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });
});
