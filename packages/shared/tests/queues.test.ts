import { describe, expect, it, vi } from "vitest";
import { ensureQueues, QUEUE_OPTIONS, QUEUES } from "../src/queues";

describe("キューの設定", () => {
  it("メールは 2 分ごとに 15 回まで再送し、完了したジョブは 1 日で消す（SC-008、research R8）", () => {
    expect(QUEUE_OPTIONS[QUEUES.sendEmail]).toMatchObject({
      retryLimit: 15,
      retryDelay: 120,
      retryBackoff: false,
      deleteAfterSeconds: 86_400,
    });
    // 30 分の停止まで耐える
    const opts = QUEUE_OPTIONS[QUEUES.sendEmail];
    expect(opts.retryLimit! * opts.retryDelay!).toBeGreaterThanOrEqual(30 * 60);
  });

  it("ensureQueues はないキューだけを作る", async () => {
    const existing = new Set<string>([QUEUES.sendEmail]);
    const boss = {
      getQueue: vi.fn(async (name: string) => (existing.has(name) ? { name } : null)),
      createQueue: vi.fn(async () => {}),
    };
    await ensureQueues(boss);
    const created = boss.createQueue.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(created).not.toContain(QUEUES.sendEmail);
    expect(created).toContain(QUEUES.cleanupUnverifiedUsers);
  });
});
