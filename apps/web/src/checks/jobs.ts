import { QUEUES } from "@app/shared/queues";
import { getSharedBoss } from "@/jobs/client";

/** 候補の照合のジョブを送る（contracts/jobs-and-cli.md §1）。データは候補の ID と回数だけ（憲章 II）。失敗したら例外を投げる。 */
export interface CheckJobSender {
  send(candidateId: string, attempt: number): Promise<void>;
}

export function createPgBossCheckSender(): CheckJobSender {
  return {
    async send(candidateId, attempt) {
      const boss = await getSharedBoss();
      await boss.send(QUEUES.trademarkCheck, { candidateId, attempt });
    },
  };
}
