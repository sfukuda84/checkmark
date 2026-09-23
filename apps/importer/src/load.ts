import {
  eq,
  inArray,
  sql,
  trademarkDatasets,
  trademarkMarks,
  trademarkReadings,
  type Database,
  type DatasetMode,
} from "@app/db";
import { normalizeText, readingKey } from "@app/trademark";
import type { ImportRow } from "./tsv";

/** データセットへの取り込み（research R1）。全件が終わるまで前の active を照合に使う（1 トランザクション）。 */

export interface ImportOptions {
  asOf: string;
  mode: DatasetMode;
  source: string;
}

export interface ImportResult {
  datasetId: string;
  status: "active";
  rowCount: number;
}

const CHUNK = 1000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function importRows(db: Database, rows: ImportRow[], options: ImportOptions): Promise<ImportResult> {
  const [dataset] = await db
    .insert(trademarkDatasets)
    .values({ source: options.source, asOfDate: options.asOf, mode: options.mode, status: "importing" })
    .returning({ id: trademarkDatasets.id });
  const datasetId = dataset!.id;

  try {
    await db.transaction(async (tx) => {
      const alive = rows.filter((r) => r.status !== "dead");
      const dead = rows.filter((r) => r.status === "dead").map((r) => r.applicationNumber);

      if (options.mode === "full") {
        // 取り込み用 TSV にない商標を消すため、生きている番号を一時テーブルに入れる。
        await tx.execute(sql`create temporary table import_keys (application_number text primary key) on commit drop`);
        for (const part of chunks(alive)) {
          const values = sql.join(
            part.map((r) => sql`(${r.applicationNumber})`),
            sql`, `,
          );
          await tx.execute(sql`insert into import_keys (application_number) values ${values} on conflict do nothing`);
        }
        await tx.execute(
          sql`delete from trademark_marks m where not exists (select 1 from import_keys k where k.application_number = m.application_number)`,
        );
      }
      for (const part of chunks(dead)) {
        await tx.delete(trademarkMarks).where(inArray(trademarkMarks.applicationNumber, part));
      }

      const now = new Date();
      for (const part of chunks(alive)) {
        await tx
          .insert(trademarkMarks)
          .values(
            part.map((r) => ({
              applicationNumber: r.applicationNumber,
              registrationNumber: r.registrationNumber,
              markText: r.markText,
              normalizedText: normalizeText(r.markText),
              holderName: r.holderName,
              classes: r.classes,
              status: r.status as "pending" | "registered",
              updatedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: trademarkMarks.applicationNumber,
            set: {
              registrationNumber: sql`excluded.registration_number`,
              markText: sql`excluded.mark_text`,
              normalizedText: sql`excluded.normalized_text`,
              holderName: sql`excluded.holder_name`,
              classes: sql`excluded.classes`,
              status: sql`excluded.status`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        await tx.delete(trademarkReadings).where(
          inArray(
            trademarkReadings.applicationNumber,
            part.map((r) => r.applicationNumber),
          ),
        );
        const readings = part.flatMap((r) =>
          r.readings
            .map((reading) => ({ applicationNumber: r.applicationNumber, reading, readingKey: readingKey(reading) }))
            .filter((x) => x.readingKey !== ""),
        );
        if (readings.length > 0) await tx.insert(trademarkReadings).values(readings).onConflictDoNothing();
      }

      await tx
        .update(trademarkDatasets)
        .set({ status: "active", rowCount: rows.length, importedAt: new Date() })
        .where(eq(trademarkDatasets.id, datasetId));
    });
  } catch (err) {
    await db.update(trademarkDatasets).set({ status: "failed" }).where(eq(trademarkDatasets.id, datasetId));
    throw err;
  }
  return { datasetId, status: "active", rowCount: rows.length };
}
