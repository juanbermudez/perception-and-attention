// Ordered schema migrations, gated on `PRAGMA user_version` (spec §11.2).
// Migration N (1-based) upgrades a database at user_version N-1 to N. Never edit a shipped
// migration: append a new one. The schema is plain SQLite, so it also runs on Turso/libSQL and D1.

import { type SqlDb, transaction } from "./sql";

export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE artifacts (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('doc', 'quiz')),
    title       TEXT NOT NULL,
    rev         INTEGER NOT NULL DEFAULT 1,
    created_by  TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE TABLE blocks (
    id           TEXT PRIMARY KEY,
    artifact_id  TEXT NOT NULL REFERENCES artifacts(id),
    ord          INTEGER NOT NULL,
    type         TEXT NOT NULL,
    indent       INTEGER NOT NULL DEFAULT 0,
    text         TEXT NOT NULL DEFAULT '',
    data         TEXT,
    rev          INTEGER NOT NULL DEFAULT 1,
    updated_by   TEXT NOT NULL CHECK (updated_by IN ('user', 'agent')),
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
  );
  CREATE INDEX blocks_by_artifact ON blocks (artifact_id, ord) WHERE deleted_at IS NULL;
  CREATE TABLE block_history (
    block_id TEXT NOT NULL, rev INTEGER NOT NULL, text TEXT NOT NULL, data TEXT,
    updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (block_id, rev)
  );
  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY, artifact_id TEXT NOT NULL, block_id TEXT NOT NULL,
    answer TEXT NOT NULL, correct INTEGER, answered_at INTEGER NOT NULL
  );
  CREATE TABLE windows (
    artifact_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open', 'minimized')),
    x REAL, y REAL, w REAL, h REAL, z INTEGER
  );
  CREATE TABLE activity (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL,
    kind TEXT NOT NULL, ref TEXT, summary TEXT
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Applies every migration above the database's user_version, each in its own transaction. Returns the versions applied. */
export function migrate(db: SqlDb, migrations: readonly string[] = MIGRATIONS): number[] {
  const current = Number(db.selectValue("PRAGMA user_version") ?? 0);
  if (current > migrations.length) throw new Error(`Database schema v${current} is newer than this page (v${migrations.length}). Reload to update.`);
  const applied: number[] = [];
  for (let version = current + 1; version <= migrations.length; version++) {
    transaction(db, () => {
      db.exec(migrations[version - 1]);
      db.exec(`PRAGMA user_version = ${version}`);
    });
    applied.push(version);
  }
  return applied;
}
