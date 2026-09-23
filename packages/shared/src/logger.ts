import pino, { type DestinationStream, type Logger } from "pino";

/**
 * ログに残してはならない項目のキー（小文字で比較する）。
 * NFR-SE-004 と憲章 II により、パスワード・トークン・セッション・メールアドレス・候補名・読み・商標の文字を伏せる。
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "session",
  "sessiontoken",
  "cookie",
  "set-cookie",
  "authorization",
  "email",
  "newemail",
  "to",
  "candidate",
  "candidates",
  "inputtext",
  "normalizedtext",
  "reading",
  "userreading",
  "marktext",
  "secret",
  "apikey",
]);

const REDACTED = "[REDACTED]";
const TOKEN_IN_URL = /([?&](?:token|code|state)=)[^&#\s]+/gi;

function scrubString(value: string): string {
  return value.replace(TOKEN_IN_URL, `$1${REDACTED}`);
}

/** オブジェクトを再帰的にたどり、機密の項目を伏せた複製を返す。 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message), stack: value.stack && scrubString(value.stack) };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LoggerOptions {
  level?: string;
  destination?: DestinationStream | NodeJS.WritableStream;
  name?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      name: options.name,
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      formatters: {
        log: (obj) => redact(obj) as Record<string, unknown>,
      },
      hooks: {
        logMethod(args, method) {
          const scrubbed = args.map((a) => (typeof a === "string" ? scrubString(a) : a)) as typeof args;
          method.apply(this, scrubbed);
        },
      },
    },
    (options.destination as DestinationStream | undefined) ?? pino.destination(1),
  );
}

export const logger = createLogger();
export type { Logger };
