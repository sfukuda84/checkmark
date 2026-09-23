import { eq, outboundEmails, type Database, type EmailKind } from "@app/db";
import { renderEmail, type MailTransport } from "@app/mail";
import type { Logger } from "@app/shared/logger";

export const SEND_EMAIL_QUEUE = "send-email";

export interface SendEmailData {
  outboundEmailId: string;
  kind: EmailKind;
  to: string;
  url: string;
}

export interface SendEmailJob {
  id: string;
  retryCount: number;
  retryLimit: number;
  data: SendEmailData;
}

/** outbound_emails の状態の更新（data-model §9 の状態の遷移）。 */
export interface OutboundEmailStore {
  markSent(id: string, attempts: number): Promise<void>;
  markRetrying(id: string, attempts: number, error: string): Promise<void>;
  markFailed(id: string, attempts: number, error: string): Promise<void>;
}

export function createOutboundEmailStore(db: Database): OutboundEmailStore {
  return {
    async markSent(id, attempts) {
      await db
        .update(outboundEmails)
        .set({ status: "sent", attempts, lastError: null })
        .where(eq(outboundEmails.id, id));
    },
    async markRetrying(id, attempts, error) {
      await db
        .update(outboundEmails)
        .set({ status: "pending", attempts, lastError: error })
        .where(eq(outboundEmails.id, id));
    },
    async markFailed(id, attempts, error) {
      await db
        .update(outboundEmails)
        .set({ status: "failed", attempts, lastError: error })
        .where(eq(outboundEmails.id, id));
    },
  };
}

export interface SendEmailDeps {
  store: OutboundEmailStore;
  transport: MailTransport;
  logger: Logger;
}

function summarize(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 300);
}

/**
 * メールを 1 通送る。失敗したら例外を投げ、pg-boss に再送させる（research R8）。
 * 宛先とリンクはログに出さない（憲章 II、NFR-SE-004）。
 */
export async function handleSendEmail(deps: SendEmailDeps, job: SendEmailJob): Promise<void> {
  const { outboundEmailId, kind, to, url } = job.data;
  const attempts = job.retryCount + 1;
  try {
    await deps.transport.send(renderEmail({ kind, to, url }));
    await deps.store.markSent(outboundEmailId, attempts);
    deps.logger.info({ outboundEmailId, kind, attempts }, "メールを送った");
  } catch (err) {
    const error = summarize(err);
    if (job.retryCount >= job.retryLimit) {
      await deps.store.markFailed(outboundEmailId, attempts, error);
      // 運営者への通知は、999-app-nfr のエラー通知がこのログを拾う（spec の Assumptions）。
      deps.logger.error({ outboundEmailId, kind, attempts, error }, "メールを送れなかった（再送を使い切った）");
    } else {
      await deps.store.markRetrying(outboundEmailId, attempts, error);
      deps.logger.warn({ outboundEmailId, kind, attempts, error }, "メールの送信に失敗した。再送する");
    }
    throw err;
  }
}
