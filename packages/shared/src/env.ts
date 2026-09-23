import { z } from "zod";

const boolFlag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET は 32 文字以上にする"),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  MAIL_TRANSPORT: z.enum(["resend", "file"]).default("file"),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().default("ネーミングチェッカー <no-reply@example.com>"),
  MAIL_OUTBOX_DIR: z.string().default(".mail-outbox"),
  MAINTENANCE_MODE: boolFlag,
  TRUSTED_PROXY_IPS: z
    .string()
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  SUPPORT_CONTACT: z.string().default("support@example.com"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** 環境変数を検証して返す。値が不正なら起動時に失敗させる。 */
export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (source === process.env && cached) return cached;
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`環境変数が不正である: ${issues}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
