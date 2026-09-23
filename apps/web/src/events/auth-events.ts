import { AUTH_EVENT_TYPES, authEvents, type AuthEventType, type Database } from "@app/db";

export interface AuthEventContext {
  userId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthEventRow {
  type: AuthEventType;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/** 認証の記録を組み立てる。メールアドレスは受け取らない（FR-031、憲章 II）。 */
export function buildAuthEvent(type: AuthEventType, ctx: AuthEventContext): AuthEventRow {
  if (!(AUTH_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`知らない認証の出来事の種類: ${String(type)}`);
  }
  return {
    type,
    userId: ctx.userId,
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
  };
}

export async function recordAuthEvent(db: Database, type: AuthEventType, ctx: AuthEventContext): Promise<void> {
  await db.insert(authEvents).values(buildAuthEvent(type, ctx));
}
