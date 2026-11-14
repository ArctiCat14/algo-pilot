import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';
import type { Platform, ProblemRecord } from './types.js';

export interface ProblemFilters {
  platform?: Platform;
  q?: string;
  difficultyMin?: number;
  difficultyMax?: number;
  tags?: string[];
  status?: 'todo' | 'attempted' | 'solved';
  page: number;
  pageSize: number;
  sort: 'default' | 'difficulty_asc' | 'difficulty_desc' | 'acceptance' | 'title' | 'newest';
}

export interface ProblemListResult {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SyncRun {
  id: number;
  platform: Platform;
  status: string;
  fetched: number;
  stored: number;
  message: string | null;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
}

const database = new DatabaseSync(DB_PATH);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 8000;
`);

export function getDatabase(): DatabaseSync {
  return database;
}

database.exec(`
  CREATE TABLE IF NOT EXISTS problems (
    platform TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    external_id TEXT NOT NULL,
    contest_id TEXT,
    problem_index TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    difficulty INTEGER,
    platform_difficulty TEXT,
    difficulty_label TEXT NOT NULL DEFAULT '未定级',
    tags_json TEXT NOT NULL DEFAULT '[]',
    total_submit INTEGER,
    total_accepted INTEGER,
    source TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    last_sync_token TEXT,
    PRIMARY KEY (platform, problem_key)
  );

  CREATE TABLE IF NOT EXISTS problem_tags (
    platform TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (platform, problem_key, tag),
    FOREIGN KEY (platform, problem_key)
      REFERENCES problems(platform, problem_key) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS problem_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    fetched INTEGER NOT NULL DEFAULT 0,
    stored INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_problems_platform ON problems(platform);
  CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(platform, difficulty);
  CREATE INDEX IF NOT EXISTS idx_problems_title ON problems(title);
  CREATE INDEX IF NOT EXISTS idx_problem_tags_tag ON problem_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_sync_runs_platform ON problem_sync_runs(platform, started_at DESC);
`);

const upsertProblem = database.prepare(`
  INSERT INTO problems (
    platform, problem_key, external_id, contest_id, problem_index, title, url,
    difficulty, platform_difficulty, difficulty_label, tags_json,
    total_submit, total_accepted, source, synced_at, last_sync_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, problem_key) DO UPDATE SET
    external_id = excluded.external_id,
    contest_id = excluded.contest_id,
    problem_index = excluded.problem_index,
    title = excluded.title,
    url = excluded.url,
    difficulty = excluded.difficulty,
    platform_difficulty = excluded.platform_difficulty,
    difficulty_label = excluded.difficulty_label,
    tags_json = excluded.tags_json,
    total_submit = excluded.total_submit,
    total_accepted = excluded.total_accepted,
    source = excluded.source,
    synced_at = excluded.synced_at,
    last_sync_token = excluded.last_sync_token
`);

const deleteProblemTags = database.prepare(`
  DELETE FROM problem_tags WHERE platform = ? AND problem_key = ?
`);

const insertProblemTag = database.prepare(`
  INSERT OR IGNORE INTO problem_tags (platform, problem_key, tag) VALUES (?, ?, ?)
`);

const deleteStaleProblems = database.prepare(`
  DELETE FROM problems WHERE platform = ? AND last_sync_token <> ?
`);

export function replacePlatformProblems(
  platform: Platform,
  token: string,
  problems: ProblemRecord[],
): number {
  const now = Date.now();
  database.exec('BEGIN IMMEDIATE');
  let stored = 0;
  try {
    for (const problem of problems) {
      const result = upsertProblem.run(
        platform,
        problem.problemKey,
        problem.externalId,
        problem.contestId,
        problem.problemIndex,
        problem.title,
        problem.url,
        problem.difficulty,
        problem.platformDifficulty,
        problem.difficultyLabel,
        JSON.stringify(problem.tags),
        problem.totalSubmit,
        problem.totalAccepted,
        problem.source,
        now,
        token,
      );
      stored += Number(result.changes);
      deleteProblemTags.run(platform, problem.problemKey);
      for (const tag of problem.tags) {
        insertProblemTag.run(platform, problem.problemKey, tag);
      }
    }
    deleteStaleProblems.run(platform, token);
    database.exec('COMMIT');
    return stored;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

export function listProblems(filters: ProblemFilters): ProblemListResult {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.platform) {
    where.push('p.platform = ?');
    params.push(filters.platform);
  }
  if (filters.q) {
    where.push('(p.title LIKE ? OR p.problem_key LIKE ? OR p.external_id LIKE ?)');
    const needle = `%${filters.q}%`;
    params.push(needle, needle, needle);
  }
  if (filters.difficultyMin !== undefined) {
    where.push('p.difficulty >= ?');
    params.push(filters.difficultyMin);
  }
  if (filters.difficultyMax !== undefined) {
    where.push('p.difficulty <= ?');
    params.push(filters.difficultyMax);
  }
  if (filters.tags?.length) {
    const placeholders = filters.tags.map(() => '?').join(', ');
    where.push(`EXISTS (
      SELECT 1 FROM problem_tags ft
      WHERE ft.platform = p.platform AND ft.problem_key = p.problem_key
        AND ft.tag IN (${placeholders})
    )`);
    params.push(...filters.tags);
  }
  if (filters.status === 'solved') {
    where.push(`EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.platform = p.platform AND s.problem_key = p.problem_key AND s.verdict = 'AC'
    )`);
  } else if (filters.status === 'attempted') {
    where.push(`EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.platform = p.platform AND s.problem_key = p.problem_key
    ) AND NOT EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.platform = p.platform AND s.problem_key = p.problem_key AND s.verdict = 'AC'
    )`);
  } else if (filters.status === 'todo') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.platform = p.platform AND s.problem_key = p.problem_key
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql =
    filters.sort === 'difficulty_asc'
      ? '(p.difficulty IS NULL) ASC, p.difficulty ASC, p.title ASC'
      : filters.sort === 'difficulty_desc'
        ? '(p.difficulty IS NULL) ASC, p.difficulty DESC, p.title ASC'
        : filters.sort === 'acceptance'
          ? '(p.total_submit IS NULL OR p.total_submit = 0) ASC, (1.0 * p.total_accepted / p.total_submit) ASC'
          : filters.sort === 'title'
            ? 'p.title COLLATE NOCASE ASC'
            : filters.sort === 'newest'
              ? 'p.synced_at DESC, p.platform ASC, p.external_id ASC'
              : "CASE p.platform WHEN 'codeforces' THEN 0 WHEN 'luogu' THEN 1 ELSE 2 END ASC, p.contest_id ASC, p.external_id ASC";

  const countRow = database
    .prepare(`SELECT COUNT(*) AS total FROM problems p ${whereSql}`)
    .get(...params) as { total: number };
  const total = Number(countRow?.total ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = database
    .prepare(
      `SELECT p.*,
        COALESCE((
          SELECT json_group_array(t.tag)
          FROM problem_tags t
          WHERE t.platform = p.platform AND t.problem_key = p.problem_key
        ), '[]') AS tags_json,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.platform = p.platform AND s.problem_key = p.problem_key AND s.verdict = 'AC'
          ) THEN 'solved'
          WHEN EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.platform = p.platform AND s.problem_key = p.problem_key
          ) THEN 'attempted'
          ELSE 'todo'
        END AS user_status,
        (SELECT COUNT(*) FROM submissions s
          WHERE s.platform = p.platform AND s.problem_key = p.problem_key) AS attempt_count
       FROM problems p
       ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, offset) as Array<Record<string, unknown>>;

  const items = rows.map((row) => ({
    platform: row.platform,
    problemKey: row.problem_key,
    externalId: row.external_id,
    contestId: row.contest_id,
    problemIndex: row.problem_index,
    title: row.title,
    url: row.url,
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    platformDifficulty: row.platform_difficulty,
    difficultyLabel: row.difficulty_label,
    tags: parseTags(row.tags_json),
    totalSubmit: row.total_submit === null ? null : Number(row.total_submit),
    totalAccepted: row.total_accepted === null ? null : Number(row.total_accepted),
    acceptance:
      row.total_submit !== null && Number(row.total_submit) > 0
        ? Number(row.total_accepted) / Number(row.total_submit)
        : null,
    status: String(row.user_status ?? 'todo') as 'todo' | 'attempted' | 'solved',
    attempts: Number(row.attempt_count ?? 0),
    syncedAt: Number(row.synced_at),
  }));

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export interface ProblemBankRef {
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
}

export function getProblemBankRef(problemKey: string): ProblemBankRef | null {
  const row = database
    .prepare(`
      SELECT p.title, p.url, p.difficulty,
        COALESCE((
          SELECT json_group_array(t.tag) FROM problem_tags t
          WHERE t.platform = p.platform AND t.problem_key = p.problem_key
        ), '[]') AS tags_json
      FROM problems p
      WHERE p.problem_key = ?
    `)
    .get(problemKey) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    title: String(row.title),
    url: String(row.url),
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    tags: parseTags(row.tags_json),
  };
}

export function getProblemBankRefs(problemKeys: string[]): Map<string, ProblemBankRef> {
  const result = new Map<string, ProblemBankRef>();
  const unique = [...new Set(problemKeys)];
  for (let offset = 0; offset < unique.length; offset += 400) {
    const chunk = unique.slice(offset, offset + 400);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = database
      .prepare(`
        SELECT p.problem_key, p.title, p.url, p.difficulty,
          COALESCE((
            SELECT json_group_array(t.tag) FROM problem_tags t
            WHERE t.platform = p.platform AND t.problem_key = p.problem_key
          ), '[]') AS tags_json
        FROM problems p
        WHERE p.problem_key IN (${placeholders})
      `)
      .all(...chunk) as Array<Record<string, unknown>>;
    for (const row of rows) {
      result.set(String(row.problem_key), {
        title: String(row.title),
        url: String(row.url),
        difficulty: row.difficulty === null ? null : Number(row.difficulty),
        tags: parseTags(row.tags_json),
      });
    }
  }
  return result;
}

export function getPlatformCounts(): Array<{ platform: Platform; count: number; lastSync: number | null }> {  const rows = database
    .prepare(
      `SELECT platform, COUNT(*) AS count, MAX(synced_at) AS last_sync
       FROM problems GROUP BY platform ORDER BY platform`,
    )
    .all() as Array<{ platform: Platform; count: number; last_sync: number | null }>;
  return rows.map((row) => ({
    platform: row.platform,
    count: Number(row.count),
    lastSync: row.last_sync === null ? null : Number(row.last_sync),
  }));
}

export function getTopTags(limit = 28): Array<{ tag: string; count: number }> {
  const rows = database
    .prepare(
      `SELECT tag, COUNT(*) AS count FROM problem_tags
       GROUP BY tag ORDER BY count DESC, tag ASC LIMIT ?`,
    )
    .all(limit) as Array<{ tag: string; count: number }>;
  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

export function getDifficultyBuckets(): Array<{ bucket: string; min: number; count: number }> {
  const buckets = [
    { bucket: '0–999', min: 0, max: 999 },
    { bucket: '1000–1199', min: 1000, max: 1199 },
    { bucket: '1200–1399', min: 1200, max: 1399 },
    { bucket: '1400–1599', min: 1400, max: 1599 },
    { bucket: '1600–1799', min: 1600, max: 1799 },
    { bucket: '1800–1999', min: 1800, max: 1999 },
    { bucket: '2000–2199', min: 2000, max: 2199 },
    { bucket: '2200–2399', min: 2200, max: 2399 },
    { bucket: '2400+', min: 2400, max: 10000 },
  ];
  return buckets.map(({ bucket, min, max }) => {
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM problems WHERE difficulty >= ? AND difficulty <= ?')
      .get(min, max) as { count: number };
    return { bucket, min, count: Number(row.count) };
  });
}

export function startSyncRun(platform: Platform): number {
  const result = database
    .prepare('INSERT INTO problem_sync_runs (platform, status, started_at) VALUES (?, ?, ?)')
    .run(platform, 'running', Date.now());
  return Number(result.lastInsertRowid);
}

export function finishSyncRun(
  id: number,
  status: 'success' | 'error',
  fetched: number,
  stored: number,
  message: string,
  startedAt: number,
): void {
  database
    .prepare(
      `UPDATE problem_sync_runs
       SET status = ?, fetched = ?, stored = ?, message = ?, finished_at = ?, duration_ms = ?
       WHERE id = ?`,
    )
    .run(status, fetched, stored, message, Date.now(), Date.now() - startedAt, id);
}

export function getRecentRuns(limit = 12): SyncRun[] {
  const rows = database
    .prepare('SELECT * FROM problem_sync_runs ORDER BY started_at DESC LIMIT ?')
    .all(limit) as unknown as SyncRun[];
  return rows.map((row) => ({
    ...row,
    fetched: Number(row.fetched),
    stored: Number(row.stored),
    started_at: Number(row.started_at),
    finished_at: row.finished_at === null ? null : Number(row.finished_at),
    duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
  }));
}

export function getSyncState<T>(key: string): T | null {
  const row = database.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSyncState(key: string, value: unknown): void {
  database
    .prepare(
      `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), Date.now());
}

export function getDatabaseInfo(): { path: string; size: number } {
  const row = database
    .prepare("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()")
    .get() as { size: number };
  return { path: DB_PATH, size: Number(row?.size ?? 0) };
}

export function closeDatabase(): void {
  database.close();
}
