import { describe, expect, it } from "vitest";
import { clientIp } from "@/auth/client-ip";

describe("clientIp", () => {
  it("信頼するプロキシを右から飛ばし、最初の信頼できない値を使う", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.2" });
    expect(clientIp(h, ["10.0.0.2"])).toBe("203.0.113.9");
  });
  it("クライアントが先頭に書いた値は使わない", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientIp(h, [])).toBe("203.0.113.9");
  });
  it("すべて信頼するプロキシなら、先頭を使う", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1" }), ["10.0.0.1"])).toBe("10.0.0.1");
  });
  it("ヘッダーがなければ x-real-ip、それもなければ null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }), [])).toBe("198.51.100.1");
    expect(clientIp(new Headers(), [])).toBeNull();
    expect(clientIp(undefined, [])).toBeNull();
  });
});
