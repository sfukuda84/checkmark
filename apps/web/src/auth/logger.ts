import type { Logger } from "@app/shared/logger";

type Level = "info" | "success" | "warn" | "error" | "debug";

/** Better Auth のログを、伏せ字つきの pino のロガーに流す（FR-030、NFR-SE-004）。 */
export function toBetterAuthLogger(logger: Logger, level: "debug" | "info" | "warn" | "error" = "warn") {
  return {
    level,
    log(lvl: Level, message: string, ...args: unknown[]) {
      const target = lvl === "success" ? "info" : lvl;
      logger[target]({ source: "better-auth", args }, message);
    },
  };
}
