import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export interface DbHandle { db: Db; pool: Pool }

/** Creates an isolated pool. Callers own `pool.end()`. */
export function createDb(connectionString: string, max = 10): DbHandle {
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: DbHandle | undefined;
/** Process-wide handle for the web app and worker. */
export function getDb(connectionString: string | undefined): DbHandle {
  if (!connectionString) throw new Error("Database is not configured");
  shared ??= createDb(connectionString);
  return shared;
}
