import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MailMessage, MailTransport } from "./transport";

/** 開発とテスト用。送ったメールを JSON で書き出す。E2E テストはここからリンクを読む。 */
export class FileTransport implements MailTransport {
  constructor(private readonly dir: string) {}

  async send(message: MailMessage): Promise<{ id: string }> {
    await mkdir(this.dir, { recursive: true });
    const id = crypto.randomUUID();
    const safeTo = message.to.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const file = path.join(this.dir, `${Date.now()}-${safeTo}-${id}.json`);
    await writeFile(file, JSON.stringify({ id, sentAt: new Date().toISOString(), ...message }, null, 2), "utf8");
    return { id };
  }
}
