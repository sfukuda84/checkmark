import { PgBoss, type JobWithMetadata } from "pg-boss";
import { createDb } from "@app/db";
import { createTransport } from "@app/mail";
import { createLogger } from "@app/shared/logger";
import { ensureQueues, QUEUES } from "@app/shared/queues";
import { createOutboundEmailStore, handleSendEmail, type SendEmailData } from "./jobs/send-email";
import { registerMaintenanceJobs } from "./jobs/schedules";
import { createPgTrademarkSource } from "./jobs/pg-trademark-source";
import { handleTrademarkCheck, type TrademarkCheckData } from "./jobs/trademark-check";
import { createKuromojiTokenizer } from "@app/trademark/reading";

const logger = createLogger({ name: "worker" });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL が設定されていない");

  const { db, pool } = createDb(databaseUrl, { max: 5 });
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: unknown) => logger.error({ err }, "pg-boss でエラーが起きた"));
  await boss.start();
  await ensureQueues(boss);

  const store = createOutboundEmailStore(db);
  const transport = createTransport();

  await boss.work(
    QUEUES.sendEmail,
    { includeMetadata: true, batchSize: 1 },
    async (jobs: JobWithMetadata<SendEmailData>[]) => {
      for (const job of jobs) {
        await handleSendEmail(
          { store, transport, logger },
          { id: job.id, retryCount: job.retryCount, retryLimit: job.retryLimit, data: job.data },
        );
      }
    },
  );

  const source = createPgTrademarkSource(db);
  const tokenizer = createKuromojiTokenizer();
  await boss.work(
    QUEUES.trademarkCheck,
    { includeMetadata: true, batchSize: 1, localConcurrency: 2 },
    async (jobs: JobWithMetadata<TrademarkCheckData>[]) => {
      for (const job of jobs) {
        await handleTrademarkCheck(
          { db, source, tokenize: tokenizer.tokenize, logger },
          { data: job.data, retryCount: job.retryCount, retryLimit: job.retryLimit },
        );
      }
    },
  );

  await registerMaintenanceJobs(boss, db, logger);

  logger.info("worker を起動した");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker を止める");
    await boss.stop({ graceful: true, timeout: 20_000 });
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "worker の起動に失敗した");
  process.exit(1);
});
