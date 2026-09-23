import type { EmailKind } from "@app/db";
import { fixedClock } from "@app/shared/time";
import { createAuth } from "@/auth/auth";
import { createStaticPwnedChecker, type PwnedPasswordChecker } from "@/auth/pwned";
import { AccountRateLimiter, createDbBucketStore } from "@/auth/rate-limit";
import type { EmailEnqueuer } from "@/jobs/client";
import { pendingConsentValue } from "@/legal/consent";
import { testDb } from "./db";

export interface SentMail {
  kind: EmailKind;
  to: string;
  url: string;
  userId: string | null;
}

export function createMailbox() {
  const sent: SentMail[] = [];
  const mailer: EmailEnqueuer = {
    async enqueue(m) {
      sent.push(m);
    },
  };
  return {
    mailer,
    sent,
    last(kind?: EmailKind, to?: string): SentMail {
      const found = [...sent].reverse().find((m) => (!kind || m.kind === kind) && (!to || m.to === to));
      if (!found) throw new Error(`メールが見つからない: ${kind ?? "*"} ${to ?? "*"}`);
      return found;
    },
  };
}

export const BASE_URL = "http://localhost:3000";

export function createTestAuth(options: { pwned?: PwnedPasswordChecker; now?: Date; google?: boolean } = {}) {
  const db = testDb();
  const mailbox = createMailbox();
  const clock = fixedClock(options.now ?? new Date());
  const auth = createAuth({
    db,
    mailer: mailbox.mailer,
    pwned: options.pwned ?? createStaticPwnedChecker(),
    limiter: new AccountRateLimiter(createDbBucketStore(db), clock),
    clock,
    env: {
      ...process.env,
      BETTER_AUTH_URL: BASE_URL,
      NODE_ENV: "test",
      GOOGLE_CLIENT_ID: options.google ? "test-client-id" : "",
      GOOGLE_CLIENT_SECRET: options.google ? "test-client-secret" : "",
    },
  });
  return { auth, db, mailbox, clock };
}

/** Cookie を覚えるブラウザの代わり。 */
export class Browser {
  private cookies = new Map<string, string>();

  constructor(
    private readonly auth: ReturnType<typeof createTestAuth>["auth"],
    private readonly ip = "203.0.113.10",
  ) {}

  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }

  agreeToTerms() {
    this.setCookie("pending_consent", encodeURIComponent(pendingConsentValue()));
  }

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  hasSession(): boolean {
    return [...this.cookies.keys()].some((k) => k.endsWith("session_token"));
  }

  headers(): Headers {
    return new Headers({
      cookie: this.cookieHeader(),
      "x-forwarded-for": this.ip,
      "user-agent": "vitest",
      origin: BASE_URL,
    });
  }

  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any; res: Response }> {
    const res = await this.auth.handler(
      new Request(`${BASE_URL}/api/auth${path}`, {
        method,
        headers: { "content-type": "application/json", ...Object.fromEntries(this.headers()) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      }),
    );
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [name, ...v] = pair!.split("=");
      const value = v.join("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim())) || value === "";
      if (expired) this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, res };
  }

  /** メールのリンク（Better Auth のエンドポイント）を開く。 */
  async open(url: string) {
    const u = new URL(url);
    return this.request("GET", `${u.pathname.replace(/^\/api\/auth/, "")}${u.search}`);
  }
}

export async function signUpAndVerify(
  t: ReturnType<typeof createTestAuth>,
  email: string,
  password = "correct-horse-battery-staple",
) {
  const b = new Browser(t.auth);
  b.agreeToTerms();
  const r = await b.request("POST", "/sign-up/email", { email, password, name: "" });
  if (r.status !== 200) throw new Error(`サインアップに失敗した: ${r.status} ${JSON.stringify(r.json)}`);
  await b.open(t.mailbox.last("verify_email", email).url);
  return b;
}
