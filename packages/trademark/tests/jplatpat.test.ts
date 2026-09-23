import { describe, expect, it } from "vitest";
import { jplatpatUrl } from "../src/jplatpat";

describe("jplatpatUrl（research R8、FR-012）", () => {
  it("出願番号から J-PlatPat の固定アドレスを作る", () => {
    expect(jplatpatUrl("2024-012345")).toBe("https://www.j-platpat.inpit.go.jp/c1801/TR/JP-2024-012345/40/ja");
  });

  it("URL に使えない文字を含む番号はエンコードする", () => {
    expect(jplatpatUrl("2024/1")).toBe("https://www.j-platpat.inpit.go.jp/c1801/TR/JP-2024%2F1/40/ja");
  });
});
