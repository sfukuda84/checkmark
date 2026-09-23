import { createHash } from "node:crypto";

/** 漏えいパスワードの確認のアダプタ（research R5、憲章 III）。 */
export interface PwnedPasswordChecker {
  /** 漏えいしていれば true、していなければ false、確かめられなければ "unknown"。 */
  isCompromised(password: string): Promise<boolean | "unknown">;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PwnedOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createPwnedPasswordChecker(options: PwnedOptions = {}): PwnedPasswordChecker {
  const doFetch = options.fetch ?? (globalThis.fetch as FetchLike);
  const timeoutMs = options.timeoutMs ?? 3000;
  const baseUrl = options.baseUrl ?? "https://api.pwnedpasswords.com/range/";
  return {
    async isCompromised(password) {
      const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // k-匿名性: SHA-1 の先頭 5 文字だけを送る。パディングで応答の大きさから推測されにくくする。
        const res = await doFetch(`${baseUrl}${prefix}`, {
          signal: controller.signal,
          headers: { "Add-Padding": "true", "User-Agent": "naming-checker" },
        });
        if (!res.ok) return "unknown";
        const body = await res.text();
        for (const line of body.split(/\r?\n/)) {
          const [s, count] = line.trim().split(":");
          if (s === suffix) return Number(count) > 0;
        }
        return false;
      } catch {
        return "unknown";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** テストと開発で使う。外部に問い合わせず、渡した一覧だけを漏えいとみなす。 */
export function createStaticPwnedChecker(
  compromised: string[] = ["password123", "password", "12345678"],
): PwnedPasswordChecker {
  const set = new Set(compromised);
  return { isCompromised: async (p) => set.has(p) };
}
