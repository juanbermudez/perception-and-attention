// The slice of sqlite-wasm's oo1.DB that the engine uses. Injected, so the engine runs the same in
// the worker (OPFS or :memory:) and in Node tests.

export type SqlValue = string | number | bigint | Uint8Array | null;
export type Bind = readonly SqlValue[] | Record<string, SqlValue>;
export type SqlRow = Record<string, SqlValue>;

export interface SqlDb {
  exec(sql: string, options?: { bind?: Bind }): unknown;
  selectObjects(sql: string, bind?: Bind): SqlRow[];
  selectValue(sql: string, bind?: Bind): SqlValue | undefined;
}

/** Runs `work` in one transaction: every statement commits together or none does. */
export function transaction<T>(db: SqlDb, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // SQLite already rolled back (for example on a full disk); the original error says why.
    }
    throw error;
  }
}
