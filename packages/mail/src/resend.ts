import { Resend } from "resend";
import type { MailMessage, MailTransport } from "./transport";

/** Resend の SDK のうち、使う部分だけの型（テストで差し替えるため）。 */
export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{ data: { id: string } | null; error: { name: string; message: string } | null }>;
  };
}

export interface ResendTransportOptions {
  client?: ResendLike;
  apiKey?: string;
  from: string;
  timeoutMs?: number;
}

/** 本番用。タイムアウトは既定で 10 秒（research R8）。 */
export class ResendTransport implements MailTransport {
  private readonly client: ResendLike;
  private readonly from: string;
  private readonly timeoutMs: number;

  constructor(options: ResendTransportOptions) {
    if (!options.client && !options.apiKey) throw new Error("RESEND_API_KEY が設定されていない");
    this.client = options.client ?? (new Resend(options.apiKey) as unknown as ResendLike);
    this.from = options.from;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`メールの送信がタイムアウトした（${this.timeoutMs}ms）`)),
        this.timeoutMs,
      );
    });
    try {
      const result = await Promise.race([this.client.emails.send({ from: this.from, ...message }), timeout]);
      if (result.error || !result.data) {
        // 宛先や本文を含めない（ログに残るため）。
        throw new Error(`Resend がエラーを返した: ${result.error?.name ?? "unknown"}: ${result.error?.message ?? ""}`);
      }
      return { id: result.data.id };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
