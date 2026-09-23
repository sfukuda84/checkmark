import type { PgBoss } from "pg-boss";
import type { Database } from "@app/db";
import type { Logger } from "@app/shared/logger";
import { QUEUES } from "@app/shared/queues";
import { cleanupUnverifiedUsers, pruneAuthEvents, pruneOutboundEmails, pruneRateLimitBuckets } from "./cleanup";

const TZ = "Asia/Tokyo";

/** 定期のジョブ（contracts/jobs-and-cli.md、research R12）。 */
const JOBS = [
  { queue: QUEUES.cleanupUnverifiedUsers, cron: "0 3 * * *", run: cleanupUnverifiedUsers },
  { queue: QUEUES.pruneAuthEvents, cron: "10 3 * * *", run: pruneAuthEvents },
  { queue: QUEUES.pruneOutboundEmails, cron: "20 3 * * *", run: pruneOutboundEmails },
  { queue: QUEUES.pruneRateLimitBuckets, cron: "5 * * * *", run: pruneRateLimitBuckets },
] as const;

export async function registerMaintenanceJobs(boss: PgBoss, db: Database, logger: Logger): Promise<void> {
  for (const job of JOBS) {
    await boss.schedule(job.queue, job.cron, null, { tz: TZ });
    await boss.work(job.queue, async () => {
      const deleted = await job.run(db, new Date());
      logger.info({ queue: job.queue, deleted }, "定期の掃除を実行した");
    });
  }
}
