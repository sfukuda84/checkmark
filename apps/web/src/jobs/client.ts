import { PgBoss } from "pg-boss";
import { eq, outboundEmails, type Database, type EmailKind } from "@app/db";
import { createLogger, type Logger } from "@app/shared/logger";
import { ensureQueues, QUEUES } from "@app/shared/queues";

/** メールを送るジョブを登録する（research R8）。宛先とリンクはジョブのデータにだけ入れ、DB には残さない。 */
export interface EmailEnqueuer {
  enqueue(input: { kind: EmailKind; to: string; url: string; userId: string | null }): Promise<void>;
}

interface JobSender {
  send(name: string, data: object): Promise<string | null>;
}

let bossPromise: Promise<PgBoss> | undefined;

/** web からはジョブの登録だけを行う。監視と定期実行は worker が担う。 */
export async function getSharedBoss(): Promise<JobSender> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL が設定されていない");
      const boss = new PgBoss({ connectionString: url, supervise: false, schedule: false, max: 2 });
      await boss.start();
      await ensureQueues(boss);
      return boss;
    })().catch((err: unknown) => {
      bossPromise = undefined;
      throw err;
    });
  }
  return bossPromise;
}

export interface EnqueuerOptions {
  getBoss?: () => Promise<JobSender>;
  logger?: Logger;
}

/**
 * ジョブの登録に失敗しても、例外は投げない（FR-023）。
 * サインアップなどの本来の処理は成功させ、行を failed にして error のログを出す。利用者は画面から送り直せる。
 */
export function createPgBossEnqueuer(db: Database, options: EnqueuerOptions = {}): EmailEnqueuer {
  const getBoss = options.getBoss ?? getSharedBoss;
  const logger = options.logger ?? createLogger({ name: "mail-enqueue" });
  return {
    async enqueue({ kind, to, url, userId }) {
      const [row] = await db
        .insert(outboundEmails)
        .values({ kind, userId, status: "pending" })
        .returning({ id: outboundEmails.id });
      try {
        const boss = await getBoss();
        await boss.send(QUEUES.sendEmail, { outboundEmailId: row!.id, kind, to, url });
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : String(err);
        await db
          .update(outboundEmails)
          .set({ status: "failed", lastError: `ジョブを登録できなかった: ${message}` })
          .where(eq(outboundEmails.id, row!.id));
        logger.error({ outboundEmailId: row!.id, kind, err }, "メールのジョブを登録できなかった");
      }
    },
  };
}
