import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@app/shared/logger";
import type { MailTransport } from "@app/mail";
import { handleSendEmail, type OutboundEmailStore, type SendEmailJob } from "../src/jobs/send-email";

function setup(_transport: MailTransport) {
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
  const store: OutboundEmailStore = {
    markSent: vi.fn().mockResolvedValue(undefined),
    markRetrying: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  return { store, logger, lines };
}

const job = (retryCount: number, retryLimit = 15): SendEmailJob => ({
  id: "job-1",
  retryCount,
  retryLimit,
  data: { outboundEmailId: "oe-1", kind: "verify_email", to: "secret@example.com", url: "https://x/verify?token=tk-9" },
});

describe("handleSendEmail", () => {
  it("送れたら sent にする", async () => {
    const transport: MailTransport = { send: vi.fn().mockResolvedValue({ id: "m1" }) };
    const { store, logger } = setup(transport);
    await handleSendEmail({ store, transport, logger }, job(0));
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ to: "secret@example.com" }));
    expect(store.markSent).toHaveBeenCalledWith("oe-1", 1);
  });

  it("失敗したら attempts を増やして例外を投げ、pg-boss に再送させる", async () => {
    const transport: MailTransport = { send: vi.fn().mockRejectedValue(new Error("Resend がエラーを返した: 503")) };
    const { store, logger } = setup(transport);
    await expect(handleSendEmail({ store, transport, logger }, job(2))).rejects.toThrow();
    expect(store.markRetrying).toHaveBeenCalledWith("oe-1", 3, expect.stringContaining("503"));
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("最後の再送でも失敗したら failed にして error のログを出す（FR-023）", async () => {
    const transport: MailTransport = { send: vi.fn().mockRejectedValue(new Error("Resend がエラーを返した: 503")) };
    const { store, logger, lines } = setup(transport);
    await expect(handleSendEmail({ store, transport, logger }, job(15, 15))).rejects.toThrow();
    expect(store.markFailed).toHaveBeenCalledWith("oe-1", 16, expect.any(String));
    const errorLine = lines.map((l) => JSON.parse(l)).find((l) => l.level === 50);
    expect(errorLine).toBeDefined();
    expect(errorLine.outboundEmailId).toBe("oe-1");
  });

  it("宛先とリンクをログに出さない", async () => {
    const transport: MailTransport = { send: vi.fn().mockRejectedValue(new Error("boom")) };
    const { store, logger, lines } = setup(transport);
    await expect(handleSendEmail({ store, transport, logger }, job(15, 15))).rejects.toThrow();
    const out = lines.join("");
    expect(out).not.toContain("secret@example.com");
    expect(out).not.toContain("tk-9");
  });
});
