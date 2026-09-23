import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

describe("createLogger", () => {
  it("機密の項目を伏せる（FR-030、NFR-SE-004）", () => {
    const { stream, lines } = capture();
    const logger = createLogger({ level: "info", destination: stream });
    logger.info(
      {
        password: "p@ss",
        token: "tk-secret-value",
        session: { token: "s" },
        cookie: "c=1",
        email: "a@example.com",
        candidate: "秘密の商品名",
        req: { headers: { authorization: "Bearer x", cookie: "y" } },
        nested: { password: "p2", email: "b@example.com", url: "https://x/?token=abc" },
        ok: "見えてよい",
      },
      "テスト",
    );
    const out = lines.join("");
    for (const secret of [
      "p@ss",
      "tk-secret-value",
      "c=1",
      "a@example.com",
      "秘密の商品名",
      "Bearer x",
      "p2",
      "b@example.com",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("見えてよい");
    expect(out).toContain("[REDACTED]");
  });

  it("候補名、読み、商標の文字を伏せる（001 FR-031、research R9）", () => {
    const { stream, lines } = capture();
    const logger = createLogger({ level: "info", destination: stream });
    logger.info(
      {
        candidateId: "c-1",
        inputText: "未公開の名前",
        normalizedText: "ミコウカイ",
        reading: "ミコウカイノナマエ",
        userReading: "ヒミツ",
        markText: "既存の商標",
      },
      "照合",
    );
    const out = lines.join("");
    for (const secret of ["未公開の名前", "ミコウカイ", "ヒミツ", "既存の商標"]) expect(out).not.toContain(secret);
    expect(out).toContain("c-1");
  });

  it("URL のクエリにあるトークンを伏せる", () => {
    const { stream, lines } = capture();
    const logger = createLogger({ level: "info", destination: stream });
    logger.info({ url: "https://app.example.com/reset-password?token=abc123&x=1" }, "url");
    const out = lines.join("");
    expect(out).not.toContain("abc123");
  });
});
