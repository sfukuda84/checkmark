import { createRequire } from "node:module";
import path from "node:path";
import { toKatakana as romajiToKatakana } from "wanakana";

/**
 * 読みの推定（research R3、FR-014）。
 * kuromoji の辞書は大きい（読み込むと約 390MB）ため、漢字を含む候補のときだけ読み込み、使わなければ手放す。
 * web はこのファイルを読み込まない（@app/trademark/reading として worker だけが使う）。
 */

export interface Token {
  surface: string;
  reading: string | null;
}

export interface ReadingDeps {
  /** 正規化後の文字が同じ既存の商標の称呼（多い順） */
  readingsForText(normalizedText: string): Promise<string[]>;
  /** 形態素解析。漢字を含む候補のときだけ呼ぶ */
  tokenize(text: string): Promise<Token[]>;
}

export interface ReadingResult {
  reading: string | null;
  estimated: boolean;
}

const KANA_ONLY = /^[\p{Script=Katakana}ー\s・\-&.'!?+,]+$/u;
const HAN = /\p{Script=Han}|[々〆ヶ]/u;
const KATAKANA = /^[\p{Script=Katakana}ー]+$/u;

const LETTERS: Record<string, string> = {
  a: "エー",
  b: "ビー",
  c: "シー",
  d: "ディー",
  e: "イー",
  f: "エフ",
  g: "ジー",
  h: "エイチ",
  i: "アイ",
  j: "ジェー",
  k: "ケー",
  l: "エル",
  m: "エム",
  n: "エヌ",
  o: "オー",
  p: "ピー",
  q: "キュー",
  r: "アール",
  s: "エス",
  t: "ティー",
  u: "ユー",
  v: "ブイ",
  w: "ダブリュー",
  x: "エックス",
  y: "ワイ",
  z: "ゼット",
};
const DIGITS = ["ゼロ", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュウ"];

/** カタカナと長音だけを残す。 */
function kanaOnly(value: string): string {
  return [...value].filter((c) => KATAKANA.test(c) && c !== "・").join("");
}

function latinReading(run: string): string {
  const kana = romajiToKatakana(run);
  if (KATAKANA.test(kana)) return kana;
  return [...run].map((c) => LETTERS[c] ?? "").join("");
}

/** 漢字を含まない文字列を、仮名・英字・数字の並びごとに読みにする。記号と空白は除く。 */
function readPlain(text: string): string {
  let out = "";
  for (const m of text.matchAll(/[a-z]+|[0-9]|[\p{Script=Katakana}ー]+|[\s\S]/gu)) {
    const run = m[0];
    if (/^[a-z]+$/.test(run)) out += latinReading(run);
    else if (/^[0-9]$/.test(run)) out += DIGITS[Number(run)];
    else out += kanaOnly(run);
  }
  return out;
}

export async function estimateReading(
  input: { normalizedText: string; userReading: string | null },
  deps: ReadingDeps,
): Promise<ReadingResult> {
  if (input.userReading) return { reading: input.userReading, estimated: false };
  const text = input.normalizedText;
  if (KANA_ONLY.test(text)) {
    const reading = kanaOnly(text);
    if (reading) return { reading, estimated: false };
  }
  const existing = (await deps.readingsForText(text))[0];
  if (existing) return { reading: existing, estimated: true };

  let reading: string;
  if (HAN.test(text)) {
    const tokens = await deps.tokenize(text);
    reading = tokens.map((t) => (t.reading ? kanaOnly(t.reading) : readPlain(t.surface.toLowerCase()))).join("");
  } else {
    reading = readPlain(text);
  }
  return { reading: reading || null, estimated: true };
}

interface KuromojiToken {
  surface_form: string;
  reading?: string;
}
interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

export interface ManagedTokenizer {
  tokenize(text: string): Promise<Token[]>;
  isLoaded(): boolean;
  /** 辞書を手放す */
  release(): void;
}

/** 使うときに辞書を読み込み、idleMs 使わなければ手放す形態素解析器。 */
export function createKuromojiTokenizer(options: { idleMs?: number } = {}): ManagedTokenizer {
  const idleMs = options.idleMs ?? 10 * 60_000;
  let loading: Promise<KuromojiTokenizer> | undefined;
  let timer: NodeJS.Timeout | undefined;

  const release = () => {
    loading = undefined;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const load = (): Promise<KuromojiTokenizer> => {
    if (!loading) {
      loading = (async () => {
        const kuromoji = (await import("kuromoji")).default;
        const require = createRequire(import.meta.url);
        const dicPath = path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");
        return new Promise<KuromojiTokenizer>((resolve, reject) => {
          kuromoji.builder({ dicPath }).build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
        });
      })().catch((err: unknown) => {
        loading = undefined;
        throw err;
      });
    }
    return loading;
  };

  return {
    async tokenize(text) {
      const tokenizer = await load();
      if (timer) clearTimeout(timer);
      timer = setTimeout(release, idleMs);
      timer.unref();
      return tokenizer.tokenize(text).map((t) => ({
        surface: t.surface_form,
        reading: t.reading && t.reading !== "*" ? toKatakanaSafe(t.reading) : null,
      }));
    },
    isLoaded: () => loading !== undefined,
    release,
  };
}

function toKatakanaSafe(reading: string): string {
  return reading.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
