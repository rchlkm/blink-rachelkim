import pg from "pg";

export type Db = Pick<pg.Pool, "query">;

export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres:///blink" });
}
