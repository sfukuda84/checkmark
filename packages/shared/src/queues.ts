/**
 * pg-boss のキューの名前と設定（contracts/jobs-and-cli.md）。web（登録）と worker（実行）で共有する。
 * pg-boss に依存させないよう、ここには値だけを置く。
 */
export const QUEUES = {
  sendEmail: "send-email",
  cleanupUnverifiedUsers: "cleanup-unverified-users",
  pruneAuthEvents: "prune-auth-events",
  pruneOutboundEmails: "prune-outbound-emails",
  pruneRateLimitBuckets: "prune-rate-limit-buckets",
  trademarkCheck: "trademark-check",
  expireTrademarkChecks: "expire-trademark-checks",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

interface QueueOptionsLike {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  deleteAfterSeconds?: number;
  expireInSeconds?: number;
}

/** メールは 2 分ごとに 15 回まで再送する（research R8、SC-008）。完了したジョブは 1 日で消す（リンクを残さない）。 */
export const QUEUE_OPTIONS: Record<QueueName, QueueOptionsLike> = {
  [QUEUES.sendEmail]: {
    retryLimit: 15,
    retryDelay: 120,
    retryBackoff: false,
    deleteAfterSeconds: 86_400,
    expireInSeconds: 60,
  },
  [QUEUES.cleanupUnverifiedUsers]: { retryLimit: 2, retryDelay: 300, deleteAfterSeconds: 604_800 },
  [QUEUES.pruneAuthEvents]: { retryLimit: 2, retryDelay: 300, deleteAfterSeconds: 604_800 },
  [QUEUES.pruneOutboundEmails]: { retryLimit: 2, retryDelay: 300, deleteAfterSeconds: 604_800 },
  [QUEUES.pruneRateLimitBuckets]: { retryLimit: 2, retryDelay: 60, deleteAfterSeconds: 86_400 },
  // 商標の照合（001 research R5）。1 回の試行は 30 秒で打ち切り、5 秒後に 1 回だけ再試行する。
  [QUEUES.trademarkCheck]: { retryLimit: 1, retryDelay: 5, retryBackoff: false, expireInSeconds: 30, deleteAfterSeconds: 86_400 },
  [QUEUES.expireTrademarkChecks]: { retryLimit: 1, retryDelay: 30, deleteAfterSeconds: 86_400 },
};

interface QueueCreator {
  createQueue(name: string, options?: QueueOptionsLike): Promise<void>;
  getQueue(name: string): Promise<unknown>;
}

/** すべてのキューを作る（すでにあれば何もしない）。 */
export async function ensureQueues(boss: QueueCreator): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) {
      await boss.createQueue(name, QUEUE_OPTIONS[name]);
    }
  }
}
