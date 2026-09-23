import { toRomaji } from "wanakana";
import { toMoras } from "./kana";

/** 称呼の似ている度合い（research R4）。モーラの列の重み付き編集距離から 0〜1 で求める。 */

export const SIMILAR_THRESHOLD = 0.6;

const SPECIAL = new Set(["ー", "ッ", "ン"]);
const VOWELS = new Set(["a", "i", "u", "e", "o"]);

/** 濁点・半濁点を外した仮名（ガ → カ、パ → ハ）。 */
function unvoice(mora: string): string {
  return mora
    .normalize("NFD")
    .replace(/[゙゚]/g, "")
    .normalize("NFC");
}

function splitRomaji(mora: string): { consonant: string; vowel: string } {
  const r = toRomaji(mora);
  const last = r.slice(-1);
  return VOWELS.has(last) ? { consonant: r.slice(0, -1), vowel: last } : { consonant: r, vowel: "" };
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  const sa = SPECIAL.has(a);
  const sb = SPECIAL.has(b);
  if (sa || sb) return sa && sb ? 0.5 : 1;
  // 清音と濁音・半濁音の違い
  if (unvoice(a) === unvoice(b)) return 0.5;
  // 同じ行（子音が同じ）で母音だけが違う
  const ra = splitRomaji(a);
  const rb = splitRomaji(b);
  if (ra.consonant === rb.consonant && ra.vowel !== rb.vowel) return 0.5;
  return 1;
}

function indelCost(mora: string): number {
  return SPECIAL.has(mora) ? 0.5 : 1;
}

/** モーラの列の重み付き編集距離。 */
export function moraDistance(a: string[], b: string[]): number {
  let prev = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1]! + indelCost(b[j - 1]!);
  for (let i = 1; i <= a.length; i++) {
    const cur = [prev[0]! + indelCost(a[i - 1]!)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + indelCost(a[i - 1]!),
        cur[j - 1]! + indelCost(b[j - 1]!),
        prev[j - 1]! + substitutionCost(a[i - 1]!, b[j - 1]!),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 似ている度合い = 1 − 距離 ÷ 長い方のモーラ数。空の読みは 0。 */
export function similarityScore(a: string, b: string): number {
  const ma = toMoras(a);
  const mb = toMoras(b);
  const longest = Math.max(ma.length, mb.length);
  if (ma.length === 0 || mb.length === 0) return 0;
  const score = 1 - moraDistance(ma, mb) / longest;
  return Math.max(0, Math.round(score * 1000) / 1000);
}
