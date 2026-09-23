import { NextResponse, type NextRequest } from "next/server";

/** メンテナンス中は、/maintenance と静的ファイル以外への要求を /maintenance に書き換え、503 を返す（FR-028、research R10）。 */
export function decideMaintenance(pathname: string, maintenance: boolean): "pass" | "rewrite" {
  if (!maintenance) return "pass";
  if (pathname === "/maintenance" || pathname.startsWith("/_next/") || pathname === "/favicon.ico") return "pass";
  return "rewrite";
}

export function proxy(request: NextRequest) {
  const maintenance = process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";
  if (decideMaintenance(request.nextUrl.pathname, maintenance) === "rewrite") {
    return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
