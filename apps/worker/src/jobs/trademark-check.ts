import {
  and,
  checkCandidates,
  checks,
  eq,
  inArray,
  markCandidateUnknown,
  trademarkResults,
  type Database,
} from "@app/db";
import { errorKind } from "@app/shared/errors";
import type { Logger } from "@app/shared/logger";
import { buildTrademarkResult, readingKey, type TrademarkSource } from "@app/trademark";
import { estimateReading, type ReadingDeps } from "@app/trademark/reading";

/** 候補 1 件の商標の照合（contracts/jobs-and-cli.md §2、research R5）。ジョブのデータは候補の ID と回数だけ。 */

export interface TrademarkCheckData {
  candidateId: string;
  attempt: number;
}

export interface TrademarkCheckJob {
  data: TrademarkCheckData;
  retryCount: number;
  retryLimit: number;
}

export interface TrademarkCheckDeps {
  db: Database;
  source: TrademarkSource;
  tokenize: ReadingDeps["tokenize"];
  logger: Logger;
  now?: () => Date;
  /** 1 回の試行の上限（既定 25 秒。キューの expireInSeconds 30 秒より短くする） */
  timeoutMs?: number;
}

const ACTIVE = ["queued", "running"] as const;

/** 再試行に回すための、種類だけを持つ例外。元の例外（cause）は付けない。 */
export class TrademarkCheckError extends Error {
  constructor(kind: string) {
    super(`商標の照合に失敗した（${kind}）`);
    this.name = "TrademarkCheckError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`照合が ${ms} ms で終わらなかった`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function handleTrademarkCheck(deps: TrademarkCheckDeps, job: TrademarkCheckJob): Promise<void> {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const { candidateId, attempt } = job.data;
  const started = Date.now();

  const [row] = await db
    .select({ candidate: checkCandidates, classes: checks.classes })
    .from(checkCandidates)
    .innerJoin(checks, eq(checks.id, checkCandidates.checkId))
    .where(eq(checkCandidates.id, candidateId));
  if (!row || row.candidate.attempt !== attempt || !ACTIVE.includes(row.candidate.status as (typeof ACTIVE)[number])) {
    logger.info({ candidateId, attempt }, "照合の対象がないか、すでに終わっているので何もしない");
    return;
  }
  const candidate = row.candidate;
  const classes = row.classes.map(Number);
  const current = and(
    eq(checkCandidates.id, candidateId),
    eq(checkCandidates.attempt, attempt),
    inArray(checkCandidates.status, [...ACTIVE]),
  );

  try {
    await db.update(checkCandidates).set({ status: "running" }).where(current);
    const work = async () => {
      const dataset = await deps.source.activeDataset();
      if (!dataset) return { kind: "no-dataset" as const };
      const { reading, estimated } = await estimateReading(
        { normalizedText: candidate.normalizedText, userReading: candidate.userReading },
        { readingsForText: (t) => deps.source.readingsForText(t), tokenize: deps.tokenize },
      );
      const key = reading ? readingKey(reading) : "";
      const [identical, similarCandidates] = await Promise.all([
        deps.source.findIdentical(candidate.normalizedText, classes),
        key ? deps.source.findSimilarCandidates(key, classes, candidate.normalizedText) : Promise.resolve([]),
      ]);
      const body = buildTrademarkResult({ reading: key ? reading : null, identical, similarCandidates });
      return { kind: "done" as const, dataset, reading, estimated, body };
    };
    const outcome = await withTimeout(work(), deps.timeoutMs ?? 25_000);

    if (outcome.kind === "no-dataset") {
      await markCandidateUnknown(db, { candidateId, attempt, errorCode: "NO_DATASET", now: now() });
      logger.warn({ candidateId, attempt }, "商標データがまだ取り込まれていないため、照合できなかった");
      return;
    }

    const { dataset, reading, estimated, body } = outcome;
    const written = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(checkCandidates)
        .set({ status: "done", reading, readingEstimated: estimated })
        .where(current)
        .returning({ id: checkCandidates.id });
      if (!updated) return false;
      const values = {
        outcome: body.outcome,
        matches: body.matches,
        datasetAsOf: dataset.asOfDate,
        checkedAt: now(),
        readingUnavailable: body.readingUnavailable,
        identicalOverflow: body.identicalOverflow,
        errorCode: null,
      };
      await tx
        .insert(trademarkResults)
        .values({ candidateId, ...values })
        .onConflictDoUpdate({ target: trademarkResults.candidateId, set: values });
      return true;
    });
    // 個別の照合結果（分類や該当件数）はログに出さない（FR-031、contracts/jobs-and-cli.md §2）。
    logger.info({ candidateId, attempt, ms: Date.now() - started }, "商標の照合を終えた");
    if (!written) logger.info({ candidateId, attempt }, "期限切れかやり直しの後だったので、結果を捨てた");
  } catch (err) {
    const last = job.retryCount >= job.retryLimit;
    // エラーのメッセージには、問い合わせの値（候補名）が入ることがあるため、種類だけを残す（憲章 II）。
    const error = errorKind(err);
    logger.error({ candidateId, attempt, retryCount: job.retryCount, last, error }, "商標の照合に失敗した");
    // 投げ直した例外は pg-boss がジョブの output に保存する。問い合わせの値（候補名）を含む元の例外は渡さない（憲章 II）。
    if (!last) throw new TrademarkCheckError(error.code ?? error.name);
    await markCandidateUnknown(db, { candidateId, attempt, errorCode: "FAILED", now: now() });
  }
}
