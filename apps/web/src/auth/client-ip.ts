/**
 * 接続元の IP を、信頼するプロキシを飛ばして決める（x-forwarded-for を右からたどる）。
 * 先頭の値はクライアントが自由に書けるため、そのままは使わない。
 */
export function clientIp(headers: Headers | undefined, trustedProxies: string[]): string | null {
  if (!headers) return null;
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (forwarded && forwarded.length > 0) {
    for (let i = forwarded.length - 1; i >= 0; i--) {
      if (!trustedProxies.includes(forwarded[i]!)) return forwarded[i]!;
    }
    return forwarded[0]!;
  }
  return headers.get("x-real-ip");
}
