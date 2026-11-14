import { getDatabase } from '../db.js';
import type { Platform } from '../types.js';
import type { ContestHistoryRecord } from '../accounts/types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS contest_records (
    platform TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    rank INTEGER,
    old_rating INTEGER,
    new_rating INTEGER,
    performance INTEGER,
    rated INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL,
    account_handle TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    last_sync_token TEXT,
    PRIMARY KEY (platform, contest_id)
  );

  CREATE INDEX IF NOT EXISTS idx_contest_records_time ON contest_records(start_at DESC);
  CREATE INDEX IF NOT EXISTS idx_contest_records_platform ON contest_records(platform, start_at DESC);
`);

export interface ContestHistoryRow extends ContestHistoryRecord {
  accountHandle: string;
  ratingDelta: number | null;
}

export interface ContestHistorySummary {
  total: number;
  platforms: Array<{ platform: Platform; count: number }>;
  bestRank: number | null;
  maxRating: number | null;
  totalDelta: number;
  firstAt: number | null;
  lastAt: number | null;
}

const upsertRecord = db.prepare(`
  INSERT INTO contest_records (
    platform, contest_id, name, start_at, rank, old_rating, new_rating,
    performance, rated, source, account_handle, synced_at, last_sync_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, contest_id) DO UPDATE SET
    name = excluded.name,
    start_at = excluded.start_at,
    rank = excluded.rank,
    old_rating = excluded.old_rating,
    new_rating = excluded.new_rating,
    performance = excluded.performance,
    rated = excluded.rated,
    source = excluded.source,
    account_handle = excluded.account_handle,
    synced_at = excluded.synced_at,
    last_sync_token = excluded.last_sync_token
`);

export function replaceContestRecords(
  platform: Platform,
  handle: string,
  token: string,
  records: ContestHistoryRecord[],
): number {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    let stored = 0;
    for (const record of records) {
      const result = upsertRecord.run(
        record.platform,
        record.contestId,
        record.name,
        record.startAt,
        record.rank,
        record.oldRating,
        record.newRating,
        record.performance,
        record.rated ? 1 : 0,
        record.source,
        handle,
        now,
        token,
      );
      stored += Number(result.changes);
    }
    db.prepare('DELETE FROM contest_records WHERE platform = ? AND (last_sync_token IS NULL OR last_sync_token <> ?)').run(
      platform,
      token,
    );
    db.exec('COMMIT');
    return stored;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function mapRow(row: Record<string, unknown>): ContestHistoryRow {
  const oldRating = row.old_rating === null ? null : Number(row.old_rating);
  const newRating = row.new_rating === null ? null : Number(row.new_rating);
  return {
    platform: row.platform as Platform,
    contestId: String(row.contest_id),
    name: String(row.name),
    startAt: Number(row.start_at),
    rank: row.rank === null ? null : Number(row.rank),
    oldRating,
    newRating,
    performance: row.performance === null ? null : Number(row.performance),
    rated: Number(row.rated) === 1,
    source: String(row.source),
    accountHandle: String(row.account_handle),
    ratingDelta:
      oldRating !== null && newRating !== null ? newRating - oldRating : null,
  };
}

export function listContestHistory(platform?: Platform): ContestHistoryRow[] {
  const rows = platform
    ? (db
        .prepare('SELECT * FROM contest_records WHERE platform = ? ORDER BY start_at DESC')
        .all(platform) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM contest_records ORDER BY start_at DESC')
        .all() as Array<Record<string, unknown>>);
  return rows.map(mapRow);
}

export function getContestHistorySummary(platform?: Platform): ContestHistorySummary {
  const rows = listContestHistory(platform);
  const counts = new Map<Platform, number>();
  let bestRank: number | null = null;
  let maxRating: number | null = null;
  let totalDelta = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;

  for (const row of rows) {
    counts.set(row.platform, (counts.get(row.platform) ?? 0) + 1);
    if (row.rank !== null && (bestRank === null || row.rank < bestRank)) bestRank = row.rank;
    if (row.newRating !== null && (maxRating === null || row.newRating > maxRating)) {
      maxRating = row.newRating;
    }
    if (row.ratingDelta !== null) totalDelta += row.ratingDelta;
    if (firstAt === null || row.startAt < firstAt) firstAt = row.startAt;
    if (lastAt === null || row.startAt > lastAt) lastAt = row.startAt;
  }

  return {
    total: rows.length,
    platforms: [...counts.entries()].map(([item, count]) => ({ platform: item, count })),
    bestRank,
    maxRating,
    totalDelta,
    firstAt,
    lastAt,
  };
}
