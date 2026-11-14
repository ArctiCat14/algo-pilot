import { getDatabase } from '../db.js';
import type { Platform } from '../types.js';
import type {
  UpsolveBoard,
  UpsolveContestGroup,
  UpsolveItem,
  UpsolvePlatform,
  UpsolveStats,
  UpsolveStatus,
} from './types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS upsolve_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    problem_key TEXT,
    contest_key TEXT,
    contest_name TEXT,
    title TEXT NOT NULL,
    difficulty INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    priority INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'todo',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_upsolve_status ON upsolve_items(status, priority, created_at);
`);

const upsolveColumns = db.prepare('PRAGMA table_info(upsolve_items)').all() as Array<{
  name: string;
}>;
if (!upsolveColumns.some((column) => column.name === 'contest_key')) {
  db.exec('ALTER TABLE upsolve_items ADD COLUMN contest_key TEXT');
}
if (!upsolveColumns.some((column) => column.name === 'contest_name')) {
  db.exec('ALTER TABLE upsolve_items ADD COLUMN contest_name TEXT');
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_upsolve_contest ON upsolve_items(contest_key, status);
`);

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function mapItem(row: Record<string, unknown>): UpsolveItem {
  return {
    id: Number(row.id),
    url: String(row.url),
    platform: row.platform as UpsolvePlatform,
    problemKey: row.problem_key === null ? null : String(row.problem_key),
    contestKey: row.contest_key === null ? null : String(row.contest_key),
    contestName: row.contest_name === null ? null : String(row.contest_name),
    title: String(row.title),
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    tags: parseTags(row.tags_json),
    note: row.note === null ? null : String(row.note),
    priority: Number(row.priority ?? 1),
    status: row.status as UpsolveStatus,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
  };
}

export function listUpsolveItems(): UpsolveItem[] {
  const rows = db
    .prepare(`
      SELECT * FROM upsolve_items
      ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END,
        priority ASC, created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapItem);
}

export function getUpsolveItem(id: number): UpsolveItem | null {
  const row = db.prepare('SELECT * FROM upsolve_items WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapItem(row) : null;
}

export function findUpsolveByUrl(url: string): UpsolveItem | null {
  const row = db.prepare('SELECT * FROM upsolve_items WHERE url = ?').get(url) as
    | Record<string, unknown>
    | undefined;
  return row ? mapItem(row) : null;
}

export function insertUpsolveItem(input: {
  url: string;
  platform: UpsolvePlatform;
  problemKey: string | null;
  contestKey?: string | null;
  contestName?: string | null;
  title: string;
  difficulty: number | null;
  tags: string[];
  note: string | null;
  priority: number;
}): UpsolveItem {
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO upsolve_items (
      url, platform, problem_key, contest_key, contest_name, title, difficulty,
      tags_json, note, priority, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)
  `).run(
    input.url,
    input.platform,
    input.problemKey,
    input.contestKey ?? null,
    input.contestName ?? null,
    input.title,
    input.difficulty,
    JSON.stringify(input.tags),
    input.note,
    input.priority,
    now,
    now,
  );
  return getUpsolveItem(Number(result.lastInsertRowid))!;
}

export function updateUpsolveItem(
  id: number,
  patch: {
    title?: string;
    tags?: string[];
    note?: string | null;
    difficulty?: number | null;
    priority?: number;
    status?: UpsolveStatus;
  },
): UpsolveItem | null {
  const current = getUpsolveItem(id);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const completedAt =
    status === 'done'
      ? current.status === 'done' && current.completedAt
        ? current.completedAt
        : Date.now()
      : null;
  db.prepare(`
    UPDATE upsolve_items SET
      title = ?, tags_json = ?, note = ?, difficulty = ?, priority = ?,
      status = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    patch.title ?? current.title,
    JSON.stringify(patch.tags ?? current.tags),
    patch.note === undefined ? current.note : patch.note,
    patch.difficulty === undefined ? current.difficulty : patch.difficulty,
    patch.priority ?? current.priority,
    status,
    Date.now(),
    completedAt,
    id,
  );
  return getUpsolveItem(id);
}

export function deleteUpsolveItem(id: number): void {
  db.prepare('DELETE FROM upsolve_items WHERE id = ?').run(id);
}

export function getUpsolveStats(): UpsolveStats {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count FROM upsolve_items GROUP BY status')
    .all() as Array<{ status: UpsolveStatus; count: number }>;
  const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
  const weekRow = db
    .prepare("SELECT COUNT(*) AS count FROM upsolve_items WHERE status = 'done' AND completed_at >= ?")
    .get(Date.now() - 7 * 86_400_000) as { count: number };
  return {
    total: rows.reduce((sum, row) => sum + Number(row.count), 0),
    todo: counts.get('todo') ?? 0,
    doing: counts.get('doing') ?? 0,
    done: counts.get('done') ?? 0,
    weekDone: Number(weekRow.count ?? 0),
  };
}

export function getUpsolveTags(): Array<{ tag: string; count: number }> {
  const rows = db.prepare('SELECT tags_json FROM upsolve_items').all() as Array<{
    tags_json: string;
  }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTags(row.tags_json)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function getUpsolveBoard(): UpsolveBoard {
  return {
    items: listUpsolveItems(),
    stats: getUpsolveStats(),
    tags: getUpsolveTags(),
    contests: listUpsolveContests(),
  };
}

export interface ContestProblem {
  problemKey: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
  status: 'todo' | 'attempted' | 'solved';
}

export function listContestProblems(platform: Platform, contestId: string): ContestProblem[] {
  const rows = db
    .prepare(`
      SELECT p.problem_key, p.title, p.url, p.difficulty,
        COALESCE((
          SELECT json_group_array(t.tag) FROM problem_tags t
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
        END AS user_status
      FROM problems p
      WHERE p.platform = ? AND p.contest_id = ?
      ORDER BY p.problem_index ASC, p.problem_key ASC
    `)
    .all(platform, contestId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    problemKey: String(row.problem_key),
    title: String(row.title),
    url: String(row.url),
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    tags: parseTags(row.tags_json),
    status: String(row.user_status) as ContestProblem['status'],
  }));
}

export function findContestName(platform: Platform, contestId: string): string | null {
  const row = db
    .prepare('SELECT name FROM contest_records WHERE platform = ? AND contest_id = ?')
    .get(platform, contestId) as { name: string } | undefined;
  return row?.name ?? null;
}

export function listUpsolveContests(): UpsolveContestGroup[] {
  const rows = db
    .prepare(`
      SELECT contest_key, contest_name, platform,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo,
        SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) AS doing,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        MAX(created_at) AS last_created
      FROM upsolve_items
      WHERE contest_key IS NOT NULL
      GROUP BY contest_key, contest_name, platform
      ORDER BY last_created DESC
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    key: String(row.contest_key),
    name: String(row.contest_name ?? row.contest_key),
    platform: row.platform as UpsolvePlatform,
    total: Number(row.total),
    todo: Number(row.todo),
    doing: Number(row.doing),
    done: Number(row.done),
  }));
}
