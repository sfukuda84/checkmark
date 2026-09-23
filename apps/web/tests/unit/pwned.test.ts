import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPwnedPasswordChecker } from "@/auth/pwned";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").toUpperCase();

function fakeFetch(body: string, status = 200) {
  return vi.fn(async (_url: string) => new Response(body, { status }));
}

describe("PwnedPasswordChecker", () => {
  it("SHA-1 の先頭 5 文字だけを送る（k-匿名性）", async () => {
    const hash = sha1("password123");
    const fetch = fakeFetch(`${hash.slice(5)}:100\r\n`);
    const checker = createPwnedPasswordChecker({ fetch, timeoutMs: 1000 });
    await checker.isCompromised("password123");
    const url = String(fetch.mock.calls[0]![0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain("password123");
    expect(url).not.toContain(hash.slice(5));
  });

  it("一致する接尾辞があり、件数が 1 以上なら漏えいとみなす", async () => {
    const hash = sha1("password123");
    const checker = createPwnedPasswordChecker({ fetch: fakeFetch(`AAAA:1\r\n${hash.slice(5)}:42`), timeoutMs: 1000 });
    await expect(checker.isCompromised("password123")).resolves.toBe(true);
  });

  it("件数 0（パディング）や不一致なら漏えいではない", async () => {
    const hash = sha1("a-very-unique-passphrase-2026");
    const checker = createPwnedPasswordChecker({ fetch: fakeFetch(`${hash.slice(5)}:0\r\nBBBB:3`), timeoutMs: 1000 });
    await expect(checker.isCompromised("a-very-unique-passphrase-2026")).resolves.toBe(false);
  });

  it("HTTP のエラーなら unknown を返す（fail-open、憲章 III）", async () => {
    const checker = createPwnedPasswordChecker({ fetch: fakeFetch("", 503), timeoutMs: 1000 });
    await expect(checker.isCompromised("x")).resolves.toBe("unknown");
  });

  it("タイムアウトしたら unknown を返す", async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const checker = createPwnedPasswordChecker({ fetch, timeoutMs: 20 });
    await expect(checker.isCompromised("x")).resolves.toBe("unknown");
  });
});
