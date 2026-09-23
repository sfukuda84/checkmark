import { FileTransport } from "./file";
import { ResendTransport } from "./resend";
import type { MailTransport } from "./transport";

export type { MailMessage, MailTransport } from "./transport";
export { FileTransport } from "./file";
export { ResendTransport } from "./resend";
export { renderEmail, type EmailTemplateInput } from "./templates";

export interface MailEnv {
  MAIL_TRANSPORT?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_OUTBOX_DIR?: string;
}

/** 環境変数 MAIL_TRANSPORT で送信手段を選ぶ（resend | file）。 */
export function createTransport(env: MailEnv = process.env): MailTransport {
  if (env.MAIL_TRANSPORT === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("MAIL_TRANSPORT=resend だが RESEND_API_KEY が設定されていない");
    return new ResendTransport({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM ?? "no-reply@example.com" });
  }
  return new FileTransport(env.MAIL_OUTBOX_DIR ?? ".mail-outbox");
}
