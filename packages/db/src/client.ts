import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDb(
  connectionString: string,
  options: { max?: number; connectionTimeoutMillis?: number } = {},
): DbHandle {
  // 接続の空きを無期限に待たない（既定 10 秒）。
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: DbHandle | undefined;

/** プロセスで 1 つの接続プールを使う。 */
export function getDb(): Database {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていない");
    shared = createDb(url);
  }
  return shared.db;
}
