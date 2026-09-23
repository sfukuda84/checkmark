import { SIMILAR_THRESHOLD, similarityScore } from "./similarity";
import type { MarkRecord, ReadingCandidate } from "./source";

/** 照合の結果の分類（FR-009、FR-013）。 */

export const MAX_SIMILAR_MATCHES = 20;
/** 同一の商標として保存・表示する上限。これを超えたら identicalOverflow を立てる（research R4）。 */
export const MAX_IDENTICAL_MATCHES = 100;
/** 上限を超えたかを知るため、取得元からは 1 件多く取り出す。 */
export const IDENTICAL_FETCH_LIMIT = MAX_IDENTICAL_MATCHES + 1;

export type MatchKind = "identical" | "similar";

export interface Match extends MarkRecord {
  kind: MatchKind;
  reading: string | null;
  score: number;
}

export interface TrademarkResultBody {
  outcome: "identical" | "similar" | "none";
  matches: Match[];
  readingUnavailable: boolean;
  /** 同一の商標が上限（100 件）を超えた */
  identicalOverflow: boolean;
}

export interface BuildInput {
  /** 照合に使った読み。得られなければ null（類似は調べない） */
  reading: string | null;
  identical: MarkRecord[];
  similarCandidates: ReadingCandidate[];
}

const byApplicationNumber = (a: { applicationNumber: string }, b: { applicationNumber: string }) =>
  a.applicationNumber < b.applicationNumber ? -1 : a.applicationNumber > b.applicationNumber ? 1 : 0;

/** 同一を先に、次に類似を似ている順（上位 20 件）に並べ、結果を分類する。 */
export function buildTrademarkResult(input: BuildInput): TrademarkResultBody {
  const identical: Match[] = [...input.identical]
    .sort(byApplicationNumber)
    .slice(0, MAX_IDENTICAL_MATCHES)
    .map((m) => ({ ...m, kind: "identical", reading: null, score: 1 }));
  const identicalIds = new Set(input.identical.map((m) => m.applicationNumber));

  const best = new Map<string, Match>();
  if (input.reading) {
    for (const c of input.similarCandidates) {
      if (identicalIds.has(c.mark.applicationNumber)) continue;
      const score = similarityScore(input.reading, c.reading);
      if (score < SIMILAR_THRESHOLD) continue;
      const current = best.get(c.mark.applicationNumber);
      if (!current || score > current.score) {
        best.set(c.mark.applicationNumber, { ...c.mark, kind: "similar", reading: c.reading, score });
      }
    }
  }
  const similar = [...best.values()]
    .sort((a, b) => b.score - a.score || byApplicationNumber(a, b))
    .slice(0, MAX_SIMILAR_MATCHES);

  const outcome = identical.length > 0 ? "identical" : similar.length > 0 ? "similar" : "none";
  return {
    outcome,
    matches: [...identical, ...similar],
    readingUnavailable: input.reading === null,
    identicalOverflow: input.identical.length > MAX_IDENTICAL_MATCHES,
  };
}
