/** Better Auth の確認用トークン（JWT）の中身を、検証せずに読む。検証はエンドポイントが済ませた後にだけ使う。 */
export interface VerificationTokenPayload {
  email?: string;
  updateTo?: string;
  requestType?: string;
}

export function readVerificationToken(token: string | null | undefined): VerificationTokenPayload {
  if (!token) return {};
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as VerificationTokenPayload;
  } catch {
    return {};
  }
}

export function tokenFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}
