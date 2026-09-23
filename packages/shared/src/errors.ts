/**
 * 例外の種類だけを取り出す（憲章 II）。
 * drizzle の DrizzleQueryError はメッセージと params に問い合わせの値（候補名）を含むので、ログや再試行の例外には種類だけを渡す。
 * pg のエラーコード（例: 57014 は statement_timeout）は cause にあることが多い。
 */
export function errorKind(err: unknown): { name: string; code: string | null } {
  if (!(err instanceof Error)) return { name: typeof err, code: null };
  const cause = (err as { cause?: { code?: unknown } }).cause;
  const code = (err as { code?: unknown }).code ?? cause?.code;
  return { name: err.name, code: typeof code === "string" ? code : null };
}
