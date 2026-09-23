import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "@app/shared/logger";
import { toBetterAuthLogger } from "@/auth/logger";

describe("Better Auth のログ（FR-030）", () => {
  it("メールアドレスとトークンを伏せて、pino に流す", () => {
    const lines: string[] = [];
    const pinoLogger = createLogger({
      level: "debug",
      destination: new Writable({
        write(c, _e, cb) {
          lines.push(c.toString());
          cb();
        },
      }),
    });
    const logger = toBetterAuthLogger(pinoLogger);
    logger.log!("warn", "Change email attempt", { email: "secret@example.com", url: "https://x/verify?token=tk-abc" });
    logger.log!("error", "failed https://x/reset-password/tk-zzz?token=tk-q", new Error("boom"));
    const out = lines.join("");
    expect(out).not.toContain("secret@example.com");
    expect(out).not.toContain("tk-abc");
    expect(out).not.toContain("tk-q");
    expect(out).toContain("Change email attempt");
  });
});
