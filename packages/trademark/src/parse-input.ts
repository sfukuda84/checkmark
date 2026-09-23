import { normalizeText, validateCandidateText, validateReading, type CandidateTextError, type ReadingError } from "./normalize";

/** 入力欄の解析（research R2、contracts/server-actions.md の startCheck）。 */

export interface ParsedCandidate {
  inputText: string;
  normalizedText: string;
  userReading: string | null;
}

export interface InputError {
  line: number;
  reason: CandidateTextError | ReadingError;
}

export interface ParsedInput {
  candidates: ParsedCandidate[];
  /** 重複としてまとめた件数 */
  merged: number;
  errors: InputError[];
}

const SEPARATOR = /[/／]/;

/** 1 行に 1 件（「候補名」または「候補名 / ヨミ」）を解析し、空行を除いて重複をまとめる。 */
export function parseCandidateInput(input: string): ParsedInput {
  const candidates: ParsedCandidate[] = [];
  const errors: InputError[] = [];
  const seen = new Set<string>();
  let merged = 0;

  input.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    const at = line.search(SEPARATOR);
    const namePart = at < 0 ? line : line.slice(0, at);
    const readingPart = at < 0 ? "" : line.slice(at + 1);

    const name = validateCandidateText(namePart);
    if (!name.ok) {
      errors.push({ line: index + 1, reason: name.reason });
      return;
    }
    let userReading: string | null = null;
    if (readingPart.trim() !== "") {
      const reading = validateReading(readingPart);
      if (!reading.ok) {
        errors.push({ line: index + 1, reason: reading.reason });
        return;
      }
      userReading = reading.reading;
    }

    const normalizedText = normalizeText(name.text);
    if (seen.has(normalizedText)) {
      merged += 1;
      return;
    }
    seen.add(normalizedText);
    candidates.push({ inputText: name.text, normalizedText, userReading });
  });

  return { candidates, merged, errors };
}
