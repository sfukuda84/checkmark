import { vi } from "vitest";
import type { Browser } from "./auth-harness";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

function unsignedJwt(payload: object): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ iss: "https://accounts.google.com", aud: "test-client-id", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}.`;
}

/** Google のトークンの交換だけを差し替える。ほかの通信はそのまま通す。 */
export function mockGoogleTokenEndpoint(profile: GoogleProfile) {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(
        JSON.stringify({
          access_token: "at",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "openid email profile",
          id_token: unsignedJwt(profile),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(input, init);
  });
}

/** Google でのログインを最後まで進め、戻り先の URL を返す。 */
export async function signInWithGoogle(b: Browser, opts: { errorCallbackURL?: string } = {}) {
  const start = await b.request("POST", "/sign-in/social", {
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: opts.errorCallbackURL ?? "/sign-up?error=google",
  });
  if (start.status !== 200) throw new Error(`Google のログインを始められない: ${JSON.stringify(start.json)}`);
  const state = new URL(start.json.url).searchParams.get("state")!;
  const cb = await b.request("GET", `/callback/google?code=test-code&state=${encodeURIComponent(state)}`);
  return { status: cb.status, location: cb.res.headers.get("location") ?? "" };
}
