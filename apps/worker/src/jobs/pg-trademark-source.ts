import { sql, type Database } from "@app/db";
import {
  IDENTICAL_FETCH_LIMIT,
  type DatasetInfo,
  type MarkRecord,
  type ReadingCandidate,
  type TrademarkSource,
} from "@app/trademark";

/** TrademarkSource の PostgreSQL 実装（research R4、憲章 III）。 */

export const TRIGRAM_THRESHOLD = 0.3;
export const MAX_SIMILAR_CANDIDATES = 300;
const SHORT_KEY_LENGTH = 4;
/** 1 つの問い合わせの上限。1 回の試行の上限（25 秒）より短くする。 */
const STATEMENT_TIMEOUT = "10s";

interface MarkRow extends Record<string, unknown> {
  application_number: string;
  registration_number: string | null;
  mark_text: string;
  holder_name: string;
  classes: number[];
  status: "pending" | "registered";
}

const toMark = (r: MarkRow): MarkRecord => ({
  applicationNumber: r.application_number,
  registrationNumber: r.registration_number,
  markText: r.mark_text,
  holderName: r.holder_name,
  classes: r.classes.map(Number),
  status: r.status,
});

const classFilter = (classes: number[]) =>
  classes.length === 0 ? sql`true` : sql`m.classes && ${`{${classes.join(",")}}`}::smallint[]`;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** すべての問い合わせに statement_timeout をかける（時間切れの後も問い合わせが残らないように）。 */
function timed<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`));
    return fn(tx);
  });
}

export function createPgTrademarkSource(db: Database): TrademarkSource {
  return {
    async activeDataset(): Promise<DatasetInfo | null> {
      const { rows } = await timed(db, (tx) =>
        tx.execute<{ id: string; as_of_date: string }>(sql`
          select id, to_char(as_of_date, 'YYYY-MM-DD') as as_of_date from trademark_datasets
          where status = 'active' order by imported_at desc limit 1
        `),
      );
      const row = rows[0];
      return row ? { id: row.id, asOfDate: row.as_of_date } : null;
    },

    async findIdentical(normalizedText, classes) {
      const { rows } = await timed(db, (tx) =>
        tx.execute<MarkRow>(sql`
          select m.* from trademark_marks m
          where m.normalized_text = ${normalizedText} and ${classFilter(classes)}
          order by m.application_number
          limit ${IDENTICAL_FETCH_LIMIT}
        `),
      );
      return rows.map(toMark);
    },

    async findSimilarCandidates(key, classes): Promise<ReadingCandidate[]> {
      if (key === "") return [];
      return timed(db, async (tx) => {
        await tx.execute(sql.raw(`set local pg_trgm.similarity_threshold = ${TRIGRAM_THRESHOLD}`));
        const { rows } = await tx.execute<MarkRow & { reading: string }>(sql`
          select m.*, r.reading from trademark_readings r
          join trademark_marks m on m.application_number = r.application_number
          where r.reading_key % ${key} and ${classFilter(classes)}
          order by similarity(r.reading_key, ${key}) desc, m.application_number
          limit ${MAX_SIMILAR_CANDIDATES}
        `);
        let extra: (MarkRow & { reading: string })[] = [];
        if (key.length < SHORT_KEY_LENGTH) {
          // 短いキーは trigram が効きにくいので、先頭の文字と長さで補う（research R4）。
          // (left(reading_key, 1), length(reading_key)) の索引で範囲を絞り、似ている順に並べてから打ち切る。
          const res = await tx.execute<MarkRow & { reading: string }>(sql`
            select m.*, r.reading from trademark_readings r
            join trademark_marks m on m.application_number = r.application_number
            where left(r.reading_key, 1) = ${key[0]!}
              and length(r.reading_key) between ${Math.max(1, key.length - 2)} and ${key.length + 2}
              and ${classFilter(classes)}
            order by similarity(r.reading_key, ${key}) desc, m.application_number
            limit ${MAX_SIMILAR_CANDIDATES}
          `);
          extra = res.rows;
        }
        const seen = new Set<string>();
        const out: ReadingCandidate[] = [];
        for (const r of [...rows, ...extra]) {
          const k = `${r.application_number}\u0000${r.reading}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ mark: toMark(r), reading: r.reading });
        }
        return out;
      });
    },

    async readingsForText(normalizedText) {
      const { rows } = await timed(db, (tx) =>
        tx.execute<{ reading: string }>(sql`
          select r.reading from trademark_marks m
          join trademark_readings r on r.application_number = m.application_number
          where m.normalized_text = ${normalizedText}
          group by r.reading order by count(*) desc, r.reading collate "C"
          limit 10
        `),
      );
      return rows.map((r) => r.reading);
    },
  };
}
