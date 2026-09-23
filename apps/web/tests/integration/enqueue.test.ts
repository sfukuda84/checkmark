import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { outboundEmails } from "@app/db";
import { createLogger } from "@app/shared/logger";
import { createPgBossEnqueuer } from "@/jobs/client";
import { closeDb, resetDb, testDb } from "../helpers/db";

function capture() {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: new Writable({
      write(c, _e, cb) {
        lines.push(c.toString());
        cb();
      },
    }),
  });
  return { logger, lines };
}

describe("メールのジョブの登録（FR-023）", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("登録できたら pending の行を作り、宛先とリンクをジョブのデータに入れる", async () => {
    const send = vi.fn().mockResolvedValue("job-1");
    const { logger } = capture();
    const enqueuer = createPgBossEnqueuer(testDb(), { getBoss: async () => ({ send }), logger });
    await enqueuer.enqueue({ kind: "verify_email", to: "a@example.com", url: "https://x/?token=t", userId: null });
    const [row] = await testDb().select().from(outboundEmails);
    expect(row).toMatchObject({ kind: "verify_email", status: "pending" });
    expect(send).toHaveBeenCalledWith("send-email", {
      outboundEmailId: row!.id,
      kind: "verify_email",
      to: "a@example.com",
      url: "https://x/?token=t",
    });
  });

  it("ジョブを登録できなくても例外を投げず、行を failed にして error のログを出す", async () => {
    const { logger, lines } = capture();
    const enqueuer = createPgBossEnqueuer(testDb(), {
      getBoss: async () => {
        throw new Error("connection refused");
      },
      logger,
    });
    await expect(
      enqueuer.enqueue({ kind: "verify_email", to: "a@example.com", url: "https://x/?token=t9", userId: null }),
    ).resolves.toBeUndefined();
    const [row] = await testDb().select().from(outboundEmails);
    expect(row!.status).toBe("failed");
    expect(row!.lastError).toContain("connection refused");
    const out = lines.join("");
    expect(out).toContain('"level":50');
    expect(out).not.toContain("a@example.com");
    expect(out).not.toContain("t9");
  });
});
