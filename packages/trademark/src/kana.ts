import { toRomaji } from "wanakana";

/** 称呼をモーラ（拍）と称呼キーに変換する（research R4）。 */

const SMALL = new Set(["ァ", "ィ", "ゥ", "ェ", "ォ", "ャ", "ュ", "ョ", "ヮ"]);
const KANA = /[\p{Script=Katakana}ー]/u;
const NON_MORA = new Set(["・", "ヽ", "ヾ", "ヿ"]);

/** カタカナの読みをモーラの列にする。拗音と小書きの仮名は前の仮名につなげ、促音・撥音・長音は 1 拍とする。 */
export function toMoras(reading: string): string[] {
  const moras: string[] = [];
  for (const ch of reading) {
    if (!KANA.test(ch) || NON_MORA.has(ch)) continue;
    if (SMALL.has(ch) && moras.length > 0) {
      moras[moras.length - 1] += ch;
    } else {
      moras.push(ch);
    }
  }
  return moras;
}

/** 称呼キー: ASCII の小文字のローマ字（長音は直前の母音）。trigram の索引に使う。 */
export function readingKey(reading: string): string {
  return toRomaji(toMoras(reading).join(""))
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
