import { PgBoss } from "pg-boss";
import { outboundEmails, type Database, type EmailKind } from "@app/db";
import { ensureQueues, QUEUES } from "@app/shared/queues";

/** メールを送るジョブを登録する（research R8）。宛先とリンクはジョブのデータにだけ入れ、DB には残さない。 */
export interface EmailEnqueuer {
  enqueue(input: { kind: EmailKind; to: string; url: string; userId: string | null }): Promise<void>;
}

let bossPromise: Promise<PgBoss> | undefined;

/** web からはジョブの登録だけを行う。監視と定期実行は worker が担う。 */
async function getBoss(): Promise<PgBoss> {
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

export function createPgBossEnqueuer(db: Database): EmailEnqueuer {
  return {
    async enqueue({ kind, to, url, userId }) {
      const [row] = await db
        .insert(outboundEmails)
        .values({ kind, userId, status: "pending" })
        .returning({ id: outboundEmails.id });
      const boss = await getBoss();
      await boss.send(QUEUES.sendEmail, { outboundEmailId: row!.id, kind, to, url });
    },
  };
}
