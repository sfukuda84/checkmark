/** 結果の画面の表示のための純粋な関数（contracts/routes.md、FR-015、FR-015a）。 */

export const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(at: Date): string {
  return dateTimeFormat.format(at);
}

/** YYYY-MM-DD を YYYY/MM/DD にする。 */
export function formatDate(date: string): string {
  return date.replaceAll("-", "/");
}

/** 基準日（日本時間の 0 時）が、調べた日時より 30 日を超えて古いか。 */
export function isDatasetStale(asOf: string | null, checkedAt: Date): boolean {
  if (!asOf) return false;
  const asOfStart = Date.parse(`${asOf}T00:00:00+09:00`);
  return checkedAt.getTime() - asOfStart > (STALE_DAYS + 1) * DAY_MS;
}

export function latestDataset(
  results: ({ datasetAsOf: string | null; checkedAt: Date } | null)[],
): { asOf: string; checkedAt: Date } | null {
  let best: { asOf: string; checkedAt: Date } | null = null;
  for (const r of results) {
    if (!r?.datasetAsOf) continue;
    if (!best || r.datasetAsOf > best.asOf || (r.datasetAsOf === best.asOf && r.checkedAt > best.checkedAt)) {
      best = { asOf: r.datasetAsOf, checkedAt: r.checkedAt };
    }
  }
  return best;
}

export function classesLabel(classes: number[]): string {
  return classes.length === 0 ? "全区分" : classes.map((c) => `第 ${c} 類`).join("、");
}

/** 入力欄に戻す行（「候補名 / ヨミ」）。照合に使った読みを添える。 */
export function prefillLines(
  candidates: { inputText: string; reading: string | null; userReading: string | null }[],
): string {
  return candidates
    .map((c) => {
      const reading = c.userReading ?? c.reading;
      return reading ? `${c.inputText} / ${reading}` : c.inputText;
    })
    .join("\n");
}
