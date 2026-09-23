/** 候補の正規化と入力の検証（research R2、FR-003、FR-004、FR-004a）。 */

export const MAX_CANDIDATES = 10;
export const MAX_CANDIDATE_LENGTH = 50;
export const MAX_READING_LENGTH = 50;

/** ひらがなをカタカナにする。ほかの文字はそのまま。 */
export function toKatakana(value: string): string {
  return value.replace(/[ぁ-ゖゝゞ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** NFKC → ひらがなをカタカナに → 英字を小文字に → 空白をそろえる。同一の判定はこの結果の一致で行う。 */
export function normalizeText(value: string): string {
  return toKatakana(value.normalize("NFKC")).toLowerCase().replace(/\s+/g, " ").trim();
}

const ALLOWED = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9 ー々〆ヶ\-・&.'!?+,]+$/u;
const KATAKANA_READING = /^[\p{Script=Katakana}ー]+$/u;

export type CandidateTextError = "EMPTY" | "TOO_LONG" | "INVALID_CHARS";
export type ReadingError = "INVALID_READING" | "READING_TOO_LONG";

/** 候補 1 件を検証する。成功なら前後の空白を除いた入力を返す。 */
export function validateCandidateText(
  raw: string,
): { ok: true; text: string } | { ok: false; reason: CandidateTextError } {
  const text = raw.trim();
  const folded = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (folded === "") return { ok: false, reason: "EMPTY" };
  if (!ALLOWED.test(folded)) return { ok: false, reason: "INVALID_CHARS" };
  if ([...folded].length > MAX_CANDIDATE_LENGTH) return { ok: false, reason: "TOO_LONG" };
  return { ok: true, text };
}

/** 利用者が添えた読みを検証し、カタカナにそろえて返す。空白は除く。 */
export function validateReading(raw: string): { ok: true; reading: string } | { ok: false; reason: ReadingError } {
  const reading = toKatakana(raw.normalize("NFKC")).replace(/\s+/g, "");
  if (!KATAKANA_READING.test(reading)) return { ok: false, reason: "INVALID_READING" };
  if ([...reading].length > MAX_READING_LENGTH) return { ok: false, reason: "READING_TOO_LONG" };
  return { ok: true, reading };
}
