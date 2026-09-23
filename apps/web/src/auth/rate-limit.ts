import { createHash } from "node:crypto";
import { sql, type Database } from "@app/db";
import { HOUR, MINUTE, systemClock, type Clock } from "@app/shared/time";

/** アカウントごとの試行の制限（research R4、FR-004、FR-008）。 */
export type LimitedAction = "sign-in" | "password-reset" | "resend-verification";

export const ACCOUNT_LIMITS: Record<LimitedAction, { max: number; windowMs: number }> = {
  "sign-in": { max: 10, windowMs: 15 * MINUTE },
  "password-reset": { max: 10, windowMs: 15 * MINUTE },
  "resend-verification": { max: 3, windowMs: HOUR },
};

/** メールアドレスそのものを持たないよう、小文字化したアドレスの SHA-256 をキーにする。 */
export function bucketKey(action: LimitedAction, email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `${action}:${digest}`;
}

export interface BucketStore {
  /** 窓の中の試行を 1 回数え、数えた後の回数を返す。窓が終わっていれば 1 から数え直す。 */
  hit(key: string, windowMs: number, now: Date): Promise<number>;
}

export function createMemoryBucketStore(): BucketStore {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return {
    async hit(key, windowMs, now) {
      const t = now.getTime();
      const b = buckets.get(key);
      if (!b || b.expiresAt <= t) {
        buckets.set(key, { count: 1, expiresAt: t + windowMs });
        return 1;
      }
      b.count += 1;
      return b.count;
    },
  };
}

/** rate_limit_buckets に対する 1 文の upsert。並行する試行でも回数を取りこぼさない。 */
export function createDbBucketStore(db: Database): BucketStore {
  return {
    async hit(key, windowMs, now) {
      const expiresAt = new Date(now.getTime() + windowMs);
      const result = await db.execute<{ count: number }>(sql`
        insert into rate_limit_buckets (key, count, window_started_at, expires_at)
        values (${key}, 1, ${now}, ${expiresAt})
        on conflict (key) do update set
          count = case when rate_limit_buckets.expires_at <= ${now} then 1 else rate_limit_buckets.count + 1 end,
          window_started_at = case when rate_limit_buckets.expires_at <= ${now} then ${now} else rate_limit_buckets.window_started_at end,
          expires_at = case when rate_limit_buckets.expires_at <= ${now} then ${expiresAt} else rate_limit_buckets.expires_at end
        returning count
      `);
      return Number(result.rows[0]?.count ?? 1);
    },
  };
}

export class AccountRateLimiter {
  constructor(
    private readonly store: BucketStore,
    private readonly clock: Clock = systemClock,
  ) {}

  /** 試行を 1 回数え、上限の内なら true を返す。 */
  async hit(action: LimitedAction, email: string): Promise<boolean> {
    const { max, windowMs } = ACCOUNT_LIMITS[action];
    const count = await this.store.hit(bucketKey(action, email), windowMs, this.clock.now());
    return count <= max;
  }
}
