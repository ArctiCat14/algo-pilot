import { getDatabase } from '../db.js';
import type { Platform } from '../types.js';
import type {
  TaskBoard,
  TaskKind,
  TaskStatus,
  TrainingSettings,
  TrainingTask,
} from './types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS training_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    difficulty INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    reason TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_for TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    notes TEXT,
    review_due_at INTEGER,
    review_stage INTEGER NOT NULL DEFAULT 0,
    UNIQUE(problem_key, scheduled_for)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_date ON training_tasks(scheduled_for, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_review ON training_tasks(status, review_due_at);
`);

const DEFAULT_SETTINGS: TrainingSettings = {
  targetRating: 1500,
  dailyGoal: 3,
  preferredPlatforms: ['codeforces', 'atcoder', 'luogu'],
  accentColor: '#d5ff66',
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTrainingSettings(): TrainingSettings {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'training'").get() as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<TrainingSettings>;
    return {
      targetRating: Number(parsed.targetRating) || DEFAULT_SETTINGS.targetRating,
      dailyGoal: Math.max(1, Math.min(6, Number(parsed.dailyGoal) || DEFAULT_SETTINGS.dailyGoal)),
      preferredPlatforms:
        Array.isArray(parsed.preferredPlatforms) && parsed.preferredPlatforms.length
          ? parsed.preferredPlatforms
          : [...DEFAULT_SETTINGS.preferredPlatforms],
      accentColor:
        typeof parsed.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accentColor)
          ? parsed.accentColor
          : DEFAULT_SETTINGS.accentColor,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveTrainingSettings(settings: TrainingSettings): TrainingSettings {
  const normalized: TrainingSettings = {
    targetRating: Math.max(800, Math.min(3500, Math.round(settings.targetRating))),
    dailyGoal: Math.max(1, Math.min(6, Math.round(settings.dailyGoal))),
    preferredPlatforms: [...new Set(settings.preferredPlatforms)].filter(Boolean),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(settings.accentColor)
      ? settings.accentColor.toLowerCase()
      : DEFAULT_SETTINGS.accentColor,
  };
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('training', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify(normalized), Date.now());
  return normalized;
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

function mapTask(row: Record<string, unknown>): TrainingTask {
  return {
    id: Number(row.id),
    platform: row.platform as Platform,
    problemKey: String(row.problem_key),
    title: String(row.title),
    url: String(row.url),
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    tags: parseTags(row.tags_json),
    reason: String(row.reason),
    kind: String(row.kind) as TaskKind,
    status: String(row.status) as TaskStatus,
    scheduledFor: String(row.scheduled_for),
    createdAt: Number(row.created_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
    notes: row.notes === null ? null : String(row.notes),
    reviewDueAt: row.review_due_at === null ? null : Number(row.review_due_at),
    reviewStage: Number(row.review_stage ?? 0),
  };
}

export function getTasksForDate(date = localDateKey()): TrainingTask[] {
  const rows = db
    .prepare(`
      SELECT * FROM training_tasks
      WHERE scheduled_for = ?
      ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END, id ASC
    `)
    .all(date) as Array<Record<string, unknown>>;
  return rows.map(mapTask);
}

export function getTasksByIds(ids: number[]): TrainingTask[] {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM training_tasks WHERE id IN (${placeholders})`)
    .all(...ids) as Array<Record<string, unknown>>;
  return rows.map(mapTask);
}

export function getDueReviews(now = Date.now()): TrainingTask[] {
  const rows = db
    .prepare(`
      SELECT * FROM training_tasks
      WHERE status = 'done' AND review_stage < 6 AND review_due_at IS NOT NULL AND review_due_at <= ?
      ORDER BY review_due_at ASC LIMIT 20
    `)
    .all(now) as Array<Record<string, unknown>>;
  return rows.map(mapTask);
}

export function getTaskHistory(limit = 12): TrainingTask[] {
  const rows = db
    .prepare(`
      SELECT * FROM training_tasks
      WHERE status IN ('done', 'skipped')
      ORDER BY COALESCE(completed_at, created_at) DESC LIMIT ?
    `)
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(mapTask);
}

export function getTaskBoard(now = Date.now()): TaskBoard {
  const date = localDateKey();
  const tasks = getTasksForDate(date);
  const reviews = getDueReviews(now);
  const history = getTaskHistory();
  const done = tasks.filter((task) => task.status === 'done').length;
  const skipped = tasks.filter((task) => task.status === 'skipped').length;
  const pending = tasks.filter((task) => task.status === 'pending').length;
  return {
    date,
    tasks,
    reviews,
    history,
    settings: getTrainingSettings(),
    stats: {
      total: tasks.length,
      done,
      skipped,
      pending,
      percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    },
  };
}

export interface NewTaskRecord {
  platform: Platform;
  problemKey: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
  reason: string;
  kind: TaskKind;
  scheduledFor: string;
}

export function insertTasks(records: NewTaskRecord[]): TrainingTask[] {
  if (!records.length) return [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO training_tasks (
      platform, problem_key, title, url, difficulty, tags_json, reason, kind,
      status, scheduled_for, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);
  const insertedIds: number[] = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    for (const record of records) {
      const result = insert.run(
        record.platform,
        record.problemKey,
        record.title,
        record.url,
        record.difficulty,
        JSON.stringify(record.tags),
        record.reason,
        record.kind,
        record.scheduledFor,
        now,
      );
      if (Number(result.changes) > 0) insertedIds.push(Number(result.lastInsertRowid));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getTasksByIds(insertedIds);
}

export function updateTaskStatus(id: number, status: 'done' | 'skipped'): TrainingTask | null {
  const now = Date.now();
  if (status === 'done') {
    db.prepare(`
      UPDATE training_tasks
      SET status = 'done', completed_at = ?, review_due_at = ?, review_stage = 0
      WHERE id = ?
    `).run(now, now + 86_400_000, id);
  } else {
    db.prepare(`
      UPDATE training_tasks
      SET status = 'skipped', completed_at = ?, review_due_at = NULL
      WHERE id = ?
    `).run(now, id);
  }
  return getTasksByIds([id])[0] ?? null;
}

export function updateTaskNotes(id: number, notes: string): TrainingTask | null {
  db.prepare('UPDATE training_tasks SET notes = ? WHERE id = ?').run(notes.slice(0, 4000), id);
  return getTasksByIds([id])[0] ?? null;
}

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];

export function reviewTask(id: number): TrainingTask | null {
  const task = getTasksByIds([id])[0];
  if (!task || task.status !== 'done') return null;
  const nextStage = task.reviewStage + 1;
  if (nextStage >= REVIEW_INTERVAL_DAYS.length) {
    db.prepare(`
      UPDATE training_tasks SET review_stage = ?, review_due_at = NULL WHERE id = ?
    `).run(nextStage, id);
  } else {
    const nextDue = Date.now() + REVIEW_INTERVAL_DAYS[nextStage] * 86_400_000;
    db.prepare(`
      UPDATE training_tasks SET review_stage = ?, review_due_at = ? WHERE id = ?
    `).run(nextStage, nextDue, id);
  }
  return getTasksByIds([id])[0] ?? null;
}

export function deletePendingTasksForDate(date = localDateKey()): number {
  const result = db
    .prepare("DELETE FROM training_tasks WHERE scheduled_for = ? AND status = 'pending'")
    .run(date);
  return Number(result.changes);
}

export function hasTasksForDate(date = localDateKey()): boolean {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM training_tasks WHERE scheduled_for = ?')
    .get(date) as { count: number };
  return Number(row.count) > 0;
}

export function getRecentTaskKeys(days = 7): Set<string> {
  const rows = db
    .prepare('SELECT problem_key FROM training_tasks WHERE created_at >= ?')
    .all(Date.now() - days * 86_400_000) as Array<{ problem_key: string }>;
  return new Set(rows.map((row) => row.problem_key));
}

export function getSolvedAndAttemptedKeys(): {
  solved: Set<string>;
  attempted: Set<string>;
} {
  const rows = db
    .prepare(`
      SELECT problem_key,
        MAX(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END) AS solved
      FROM submissions GROUP BY problem_key
    `)
    .all() as Array<{ problem_key: string; solved: number }>;
  const solved = new Set<string>();
  const attempted = new Set<string>();
  for (const row of rows) {
    attempted.add(row.problem_key);
    if (Number(row.solved) === 1) solved.add(row.problem_key);
  }
  return { solved, attempted };
}

export interface ProblemCandidate {
  platform: Platform;
  problemKey: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
  acceptance: number | null;
}

export function findProblemCandidates(options: {
  tag?: string;
  min: number;
  max: number;
  platforms: Platform[];
  limit?: number;
}): ProblemCandidate[] {
  const where = ['p.difficulty IS NOT NULL', 'p.difficulty BETWEEN ? AND ?'];
  const params: Array<string | number> = [options.min, options.max];

  if (options.platforms.length) {
    where.push(`p.platform IN (${options.platforms.map(() => '?').join(', ')})`);
    params.push(...options.platforms);
  }
  if (options.tag) {
    where.push(`EXISTS (
      SELECT 1 FROM problem_tags t
      WHERE t.platform = p.platform AND t.problem_key = p.problem_key AND t.tag = ?
    )`);
    params.push(options.tag);
  }

  const sql = `
    SELECT p.platform, p.problem_key, p.title, p.url, p.difficulty,
      COALESCE((
        SELECT json_group_array(t.tag) FROM problem_tags t
        WHERE t.platform = p.platform AND t.problem_key = p.problem_key
      ), '[]') AS tags_json,
      CASE WHEN p.total_submit > 0 THEN 1.0 * p.total_accepted / p.total_submit ELSE NULL END AS acceptance
    FROM problems p
    WHERE ${where.join(' AND ')}
    ORDER BY ABS(p.difficulty - ?) ASC, RANDOM()
    LIMIT ?
  `;
  const target = Math.round((options.min + options.max) / 2);
  const rows = db.prepare(sql).all(...params, target, options.limit ?? 60) as Array<
    Record<string, unknown>
  >;
  return rows.map((row) => ({
    platform: row.platform as Platform,
    problemKey: String(row.problem_key),
    title: String(row.title),
    url: String(row.url),
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    tags: parseTags(row.tags_json),
    acceptance: row.acceptance === null ? null : Number(row.acceptance),
  }));
}
