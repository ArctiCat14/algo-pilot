import { getDatabase } from '../db.js';
import { PLATFORMS, type Platform } from '../types.js';
import type {
  Account,
  AccountOverview,
  AccountProfile,
  AccountSubmission,
  ActivityDay,
  SubmissionFilters,
  SubmissionList,
  SubmissionRow,
} from './types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    platform TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    profile_url TEXT,
    rating INTEGER,
    max_rating INTEGER,
    rank TEXT,
    solved_count INTEGER NOT NULL DEFAULT 0,
    submission_count INTEGER NOT NULL DEFAULT 0,
    last_sync_at INTEGER,
    status TEXT NOT NULL DEFAULT 'idle',
    error TEXT,
    source TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    problem_title TEXT,
    problem_url TEXT,
    verdict TEXT NOT NULL,
    raw_verdict TEXT,
    language TEXT,
    submitted_at INTEGER,
    rating INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL,
    account_handle TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    last_sync_token TEXT,
    PRIMARY KEY (platform, external_id)
  );

  CREATE TABLE IF NOT EXISTS account_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    status TEXT NOT NULL,
    fetched INTEGER NOT NULL DEFAULT 0,
    stored INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_submissions_time ON submissions(submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_submissions_platform ON submissions(platform, submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions(platform, problem_key);
  CREATE INDEX IF NOT EXISTS idx_submissions_verdict ON submissions(verdict);
  CREATE INDEX IF NOT EXISTS idx_account_runs_platform ON account_sync_runs(platform, started_at DESC);

  UPDATE submissions
  SET rating = (
    SELECT p.difficulty FROM problems p
    WHERE p.problem_key = submissions.problem_key
  )
  WHERE rating IS NULL
    AND EXISTS (
      SELECT 1 FROM problems p
      WHERE p.problem_key = submissions.problem_key AND p.difficulty IS NOT NULL
    );
`);

const accountColumns = `
  platform, handle, display_name, avatar_url, profile_url, rating, max_rating, rank,
  solved_count, submission_count, last_sync_at, status, error, source
`;

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function mapAccount(row: Record<string, unknown>): Account {
  return {
    platform: row.platform as Platform,
    handle: String(row.handle),
    displayName: row.display_name === null ? null : String(row.display_name),
    avatarUrl: row.avatar_url === null ? null : String(row.avatar_url),
    profileUrl: row.profile_url === null ? null : String(row.profile_url),
    rating: row.rating === null ? null : Number(row.rating),
    maxRating: row.max_rating === null ? null : Number(row.max_rating),
    rank: row.rank === null ? null : String(row.rank),
    solvedCount: Number(row.solved_count ?? 0),
    submissionCount: Number(row.submission_count ?? 0),
    lastSyncAt: row.last_sync_at === null ? null : Number(row.last_sync_at),
    status: String(row.status ?? 'idle'),
    error: row.error === null ? null : String(row.error),
    source: row.source === null ? null : String(row.source),
  };
}

function mapSubmission(row: Record<string, unknown>): SubmissionRow {
  return {
    platform: row.platform as Platform,
    externalId: String(row.external_id),
    problemKey: String(row.problem_key),
    problemTitle: row.problem_title === null ? null : String(row.problem_title),
    problemUrl: row.problem_url === null ? null : String(row.problem_url),
    verdict: String(row.verdict),
    rawVerdict: row.raw_verdict === null ? null : String(row.raw_verdict),
    language: row.language === null ? null : String(row.language),
    submittedAt: row.submitted_at === null ? null : Number(row.submitted_at),
    rating: row.rating === null ? null : Number(row.rating),
    tags: parseTags(row.tags_json),
    source: String(row.source),
    syncedAt: Number(row.synced_at),
    accountHandle: String(row.account_handle),
  };
}

function platformOrder(platform: Platform): number {
  return platform === 'codeforces' ? 0 : platform === 'atcoder' ? 1 : 2;
}

export function listAccounts(): Account[] {
  const rows = db
    .prepare(`SELECT ${accountColumns} FROM accounts`)
    .all() as Array<Record<string, unknown>>;
  return rows
    .map(mapAccount)
    .sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
}

export function getAccount(platform: Platform): Account | null {
  const row = db
    .prepare(`SELECT ${accountColumns} FROM accounts WHERE platform = ?`)
    .get(platform) as Record<string, unknown> | undefined;
  return row ? mapAccount(row) : null;
}

export function setAccountSyncState(
  platform: Platform,
  status: 'syncing' | 'error' | 'ready',
  error: string | null = null,
): void {
  db.prepare('UPDATE accounts SET status = ?, error = ?, updated_at = ? WHERE platform = ?').run(
    status,
    error,
    Date.now(),
    platform,
  );
}

export function upsertAccount(
  profile: AccountProfile,
  status: 'ready' | 'error' = 'ready',
): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO accounts (
      platform, handle, display_name, avatar_url, profile_url, rating, max_rating, rank,
      status, error, source, created_at, updated_at, last_sync_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(platform) DO UPDATE SET
      handle = excluded.handle,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      profile_url = excluded.profile_url,
      rating = excluded.rating,
      max_rating = excluded.max_rating,
      rank = excluded.rank,
      status = excluded.status,
      error = NULL,
      source = excluded.source,
      updated_at = excluded.updated_at,
      last_sync_at = excluded.last_sync_at
  `).run(
    profile.platform,
    profile.handle,
    profile.displayName,
    profile.avatarUrl,
    profile.profileUrl,
    profile.rating,
    profile.maxRating,
    profile.rank,
    status,
    profile.source,
    now,
    now,
    now,
  );
}

export function recordAccountError(platform: Platform, handle: string, message: string): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO accounts (
      platform, handle, display_name, avatar_url, profile_url, rating, max_rating, rank,
      status, error, source, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'error', ?, NULL, ?, ?)
    ON CONFLICT(platform) DO UPDATE SET
      handle = excluded.handle,
      status = 'error',
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(platform, handle, message, now, now);
}

export function deleteAccount(platform: Platform): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM submissions WHERE platform = ?').run(platform);
    db.prepare('DELETE FROM accounts WHERE platform = ?').run(platform);
    db.prepare('DELETE FROM account_sync_runs WHERE platform = ?').run(platform);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const upsertSubmission = db.prepare(`
  INSERT INTO submissions (
    platform, external_id, problem_key, problem_title, problem_url, verdict, raw_verdict,
    language, submitted_at, rating, tags_json, source, account_handle, synced_at, last_sync_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, external_id) DO UPDATE SET
    problem_key = excluded.problem_key,
    problem_title = excluded.problem_title,
    problem_url = excluded.problem_url,
    verdict = excluded.verdict,
    raw_verdict = excluded.raw_verdict,
    language = excluded.language,
    submitted_at = excluded.submitted_at,
    rating = excluded.rating,
    tags_json = excluded.tags_json,
    source = excluded.source,
    account_handle = excluded.account_handle,
    synced_at = excluded.synced_at,
    last_sync_token = excluded.last_sync_token
`);

const deleteStaleSubmissions = db.prepare(`
  DELETE FROM submissions WHERE platform = ? AND (last_sync_token IS NULL OR last_sync_token <> ?)
`);

const updateAccountCounts = db.prepare(`
  UPDATE accounts SET
    solved_count = (
      SELECT COUNT(DISTINCT problem_key) FROM submissions
      WHERE platform = ? AND verdict = 'AC'
    ),
    submission_count = (
      SELECT COUNT(*) FROM submissions WHERE platform = ?
    ),
    updated_at = ?
  WHERE platform = ?
`);

export function replaceAccountSubmissions(
  platform: Platform,
  handle: string,
  token: string,
  submissions: AccountSubmission[],
): number {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  let stored = 0;
  try {
    for (const submission of submissions) {
      const result = upsertSubmission.run(
        platform,
        submission.externalId,
        submission.problemKey,
        submission.problemTitle,
        submission.problemUrl,
        submission.verdict,
        submission.rawVerdict,
        submission.language,
        submission.submittedAt,
        submission.rating,
        JSON.stringify(submission.tags),
        submission.source,
        handle,
        now,
        token,
      );
      stored += Number(result.changes);
    }
    deleteStaleSubmissions.run(platform, token);
    updateAccountCounts.run(platform, platform, now, platform);
    db.exec('COMMIT');
    return stored;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function startAccountRun(platform: Platform, handle: string): number {
  const result = db
    .prepare('INSERT INTO account_sync_runs (platform, handle, status, started_at) VALUES (?, ?, ?, ?)')
    .run(platform, handle, 'running', Date.now());
  return Number(result.lastInsertRowid);
}

export function finishAccountRun(
  id: number,
  status: 'success' | 'error',
  fetched: number,
  stored: number,
  message: string | null,
  startedAt: number,
): void {
  const now = Date.now();
  db.prepare(`
    UPDATE account_sync_runs
    SET status = ?, fetched = ?, stored = ?, message = ?, finished_at = ?, duration_ms = ?
    WHERE id = ?
  `).run(status, fetched, stored, message, now, now - startedAt, id);
}

export function listSubmissions(filters: SubmissionFilters): SubmissionList {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.platform) {
    where.push('platform = ?');
    params.push(filters.platform);
  }
  if (filters.verdict) {
    where.push('verdict = ?');
    params.push(filters.verdict);
  }
  if (filters.q) {
    where.push('(problem_title LIKE ? OR problem_key LIKE ?)');
    const needle = `%${filters.q}%`;
    params.push(needle, needle);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM submissions ${whereSql}`)
    .get(...params) as { total: number };
  const total = Number(totalRow?.total ?? 0);
  const rows = db
    .prepare(`
      SELECT * FROM submissions ${whereSql}
      ORDER BY (submitted_at IS NULL) ASC, submitted_at DESC, external_id DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as Array<
    Record<string, unknown>
  >;

  return {
    items: rows.map(mapSubmission),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getActivity(days: number): ActivityDay[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = db
    .prepare(`
      SELECT date(submitted_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
      FROM submissions
      WHERE submitted_at IS NOT NULL AND submitted_at >= ?
      GROUP BY day
    `)
    .all(start.getTime()) as Array<{ day: string; count: number }>;
  const counts = new Map(rows.map((row) => [row.day, Number(row.count)]));

  const result: ActivityDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDayKey(date);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

function getStreak(): number {
  const rows = db
    .prepare(`
      SELECT DISTINCT date(submitted_at / 1000, 'unixepoch', 'localtime') AS day
      FROM submissions
      WHERE submitted_at IS NOT NULL
      ORDER BY day DESC
    `)
    .all() as Array<{ day: string }>;
  if (!rows.length) return 0;
  const days = new Set(rows.map((row) => row.day));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getAccountOverview(): AccountOverview {
  const accounts = listAccounts();
  const submissionRow = db
    .prepare('SELECT COUNT(*) AS total FROM submissions')
    .get() as { total: number };
  const activeRow = db
    .prepare(`
      SELECT COUNT(DISTINCT date(submitted_at / 1000, 'unixepoch', 'localtime')) AS days
      FROM submissions WHERE submitted_at IS NOT NULL
    `)
    .get() as { days: number };
  const solvedRow = db
    .prepare("SELECT COUNT(*) AS total FROM (SELECT DISTINCT platform, problem_key FROM submissions WHERE verdict = 'AC')")
    .get() as { total: number };
  const recent = db
    .prepare(`
      SELECT * FROM submissions
      ORDER BY (submitted_at IS NULL) ASC, submitted_at DESC, external_id DESC
      LIMIT 14
    `)
    .all() as Array<Record<string, unknown>>;
  const verdictRows = db
    .prepare('SELECT verdict, COUNT(*) AS count FROM submissions GROUP BY verdict ORDER BY count DESC LIMIT 6')
    .all() as Array<{ verdict: string; count: number }>;

  return {
    totalSolved: Number(solvedRow.total),
    totalSubmissions: Number(submissionRow.total),
    activeDays: Number(activeRow.days),
    streak: getStreak(),
    lastSync: accounts.reduce<number | null>((latest, account) => {
      if (!account.lastSyncAt) return latest;
      return latest === null ? account.lastSyncAt : Math.max(latest, account.lastSyncAt);
    }, null),
    accounts,
    recent: recent.map(mapSubmission),
    activity: getActivity(140),
    verdicts: verdictRows.map((row) => ({ verdict: row.verdict, count: Number(row.count) })),
  };
}

export function getAccountRunSummary(): Array<{
  platform: Platform;
  handle: string;
  status: string;
  fetched: number;
  finished_at: number | null;
}> {
  const rows = db
    .prepare(`
      SELECT platform, handle, status, fetched, finished_at
      FROM account_sync_runs
      ORDER BY started_at DESC LIMIT 12
    `)
    .all() as Array<{
    platform: Platform;
    handle: string;
    status: string;
    fetched: number;
    finished_at: number | null;
  }>;
  return rows.map((row) => ({ ...row, fetched: Number(row.fetched) }));
}

export interface AnalysisSubmission {
  platform: Platform;
  problemKey: string;
  verdict: string;
  submittedAt: number | null;
  rating: number | null;
  tags: string[];
}

export function getSubmissionsForAnalysis(): AnalysisSubmission[] {
  const rows = db
    .prepare(`
      SELECT platform, problem_key, verdict, submitted_at, rating, tags_json
      FROM submissions
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    platform: row.platform as Platform,
    problemKey: String(row.problem_key),
    verdict: String(row.verdict),
    submittedAt: row.submitted_at === null ? null : Number(row.submitted_at),
    rating: row.rating === null ? null : Number(row.rating),
    tags: parseTags(row.tags_json),
  }));
}

export function getProblemTagTotals(): Map<string, number> {
  const rows = db
    .prepare('SELECT tag, COUNT(*) AS count FROM problem_tags GROUP BY tag')
    .all() as Array<{ tag: string; count: number }>;
  return new Map(rows.map((row) => [row.tag, Number(row.count)]));
}

export { PLATFORMS };

