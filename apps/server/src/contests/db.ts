import { getDatabase, getSyncState, setSyncState } from '../db.js';
import type { ContestPlatform } from './types.js';
import type { ContestRecord } from './types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS contests (
    platform TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    url TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    last_sync_token TEXT,
    PRIMARY KEY (platform, contest_id)
  );

  CREATE TABLE IF NOT EXISTS contest_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    fetched INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_contests_start ON contests(start_at);
  CREATE INDEX IF NOT EXISTS idx_contests_platform ON contests(platform, start_at);

  DELETE FROM contests WHERE platform NOT IN ('codeforces', 'atcoder', 'nowcoder');
`);

const upsertContest = db.prepare(`
  INSERT INTO contests (
    platform, contest_id, name, start_at, duration_seconds, url, note, source,
    synced_at, last_sync_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, contest_id) DO UPDATE SET
    name = excluded.name,
    start_at = excluded.start_at,
    duration_seconds = excluded.duration_seconds,
    url = excluded.url,
    note = excluded.note,
    source = excluded.source,
    synced_at = excluded.synced_at,
    last_sync_token = excluded.last_sync_token
`);

const deleteStale = db.prepare(`
  DELETE FROM contests WHERE platform = ? AND (last_sync_token IS NULL OR last_sync_token <> ?)
`);

export function replacePlatformContests(
  platform: ContestPlatform,
  token: string,
  contests: ContestRecord[],
): number {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  let stored = 0;
  try {
    for (const contest of contests) {
      const result = upsertContest.run(
        platform,
        contest.contestId,
        contest.name,
        contest.startAt,
        contest.durationSeconds,
        contest.url,
        contest.note,
        contest.source,
        now,
        token,
      );
      stored += Number(result.changes);
    }
    deleteStale.run(platform, token);
    db.exec('COMMIT');
    return stored;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listContestRows(): ContestRecord[] {
  const rows = db
    .prepare(`
      SELECT platform, contest_id, name, start_at, duration_seconds, url, note, source
      FROM contests
      ORDER BY start_at ASC
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    platform: row.platform as ContestPlatform,
    contestId: String(row.contest_id),
    name: String(row.name),
    startAt: Number(row.start_at),
    durationSeconds: Number(row.duration_seconds),
    url: String(row.url),
    note: row.note === null ? null : String(row.note),
    source: String(row.source),
  }));
}

export interface ContestSyncMeta {
  syncedAt: number;
  errors: Array<{ platform: ContestPlatform; message: string }>;
}

export function getContestSyncMeta(): ContestSyncMeta | null {
  return getSyncState<ContestSyncMeta>('contests:last_sync');
}

export function setContestSyncMeta(meta: ContestSyncMeta): void {
  setSyncState('contests:last_sync', meta);
}

export function startContestRun(platform: ContestPlatform): number {
  const result = db
    .prepare('INSERT INTO contest_sync_runs (platform, status, started_at) VALUES (?, ?, ?)')
    .run(platform, 'running', Date.now());
  return Number(result.lastInsertRowid);
}

export function finishContestRun(
  id: number,
  status: 'success' | 'error',
  fetched: number,
  message: string | null,
  startedAt: number,
): void {
  const now = Date.now();
  db.prepare(`
    UPDATE contest_sync_runs
    SET status = ?, fetched = ?, message = ?, finished_at = ?, duration_ms = ?
    WHERE id = ?
  `).run(status, fetched, message, now, now - startedAt, id);
}

export function getContestRunErrors(): Array<{
  platform: ContestPlatform;
  message: string;
  at: number;
}> {
  const rows = db
    .prepare(`
      SELECT platform, message, started_at FROM contest_sync_runs
      WHERE status = 'error' ORDER BY started_at DESC LIMIT 6
    `)
    .all() as Array<{ platform: ContestPlatform; message: string | null; started_at: number }>;
  return rows.map((row) => ({
    platform: row.platform,
    message: row.message ?? '同步失败',
    at: Number(row.started_at),
  }));
}
