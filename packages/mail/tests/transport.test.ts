import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileTransport } from "../src/file";
import { ResendTransport, type ResendLike } from "../src/resend";
import { createTransport } from "../src/index";

const message = { to: "a@example.com", subject: "件名", text: "本文 https://x/?token=abc", html: "<p>本文</p>" };

describe("FileTransport", () => {
  it("送ったメールを JSON で書き出す", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "outbox-"));
    const t = new FileTransport(dir);
    const { id } = await t.send(message);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(path.join(dir, files[0]!), "utf8"));
    expect(saved).toMatchObject({ id, ...message });
  });
});

describe("ResendTransport", () => {
  it("Resend の送信 ID を返す", async () => {
    const client: ResendLike = { emails: { send: vi.fn().mockResolvedValue({ data: { id: "re_1" }, error: null }) } };
    const t = new ResendTransport({ client, from: "from@example.com", timeoutMs: 1000 });
    await expect(t.send(message)).resolves.toEqual({ id: "re_1" });
    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "from@example.com", to: "a@example.com", subject: "件名" }),
    );
  });

  it("Resend のエラーを例外にする（宛先を含めない）", async () => {
    const client: ResendLike = {
      emails: { send: vi.fn().mockResolvedValue({ data: null, error: { name: "rate_limit", message: "Too many" } }) },
    };
    const t = new ResendTransport({ client, from: "from@example.com", timeoutMs: 1000 });
    const err = await t.send(message).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("rate_limit");
    expect(err.message).not.toContain("a@example.com");
  });

  it("タイムアウトしたら例外にする", async () => {
    const client: ResendLike = { emails: { send: vi.fn(() => new Promise(() => {})) } };
    const t = new ResendTransport({ client, from: "from@example.com", timeoutMs: 20 });
    await expect(t.send(message)).rejects.toThrow(/タイムアウト/);
  });
});

describe("createTransport", () => {
  it("MAIL_TRANSPORT で送信手段を選ぶ", () => {
    expect(createTransport({ MAIL_TRANSPORT: "file", MAIL_OUTBOX_DIR: "/tmp/x" })).toBeInstanceOf(FileTransport);
    expect(
      createTransport({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@example.com" }),
    ).toBeInstanceOf(ResendTransport);
  });

  it("resend なのに API キーがなければ失敗させる", () => {
    expect(() => createTransport({ MAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
  });
});
