import { getDatabase } from '../db.js';
import type {
  LocalProblemList,
  LocalProblemListDetail,
  ProblemListItem,
} from './types.js';

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS problem_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL DEFAULT 'luogu',
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    provider TEXT,
    url TEXT NOT NULL,
    problem_count INTEGER NOT NULL DEFAULT 0,
    mark_count INTEGER NOT NULL DEFAULT 0,
    imported_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(platform, external_id)
  );

  CREATE TABLE IF NOT EXISTS problem_list_items (
    list_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    problem_key TEXT NOT NULL,
    pid TEXT NOT NULL,
    title TEXT NOT NULL,
    difficulty INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (list_id, problem_key),
    FOREIGN KEY (list_id) REFERENCES problem_lists(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_list_items_list ON problem_list_items(list_id, position);
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

function mapList(row: Record<string, unknown>): LocalProblemList {
  return {
    id: Number(row.id),
    platform: 'luogu',
    externalId: String(row.external_id),
    name: String(row.name),
    provider: row.provider === null ? null : String(row.provider),
    url: String(row.url),
    problemCount: Number(row.problem_count ?? 0),
    solvedCount: Number(row.solved_count ?? 0),
    importedAt: Number(row.imported_at),
    updatedAt: Number(row.updated_at),
    description: row.description === null ? null : String(row.description),
    markCount: Number(row.mark_count ?? 0),
  };
}

export interface ImportedListInput {
  externalId: string;
  name: string;
  description: string | null;
  provider: string | null;
  url: string;
  problemCount: number;
  markCount: number;
  items: Array<{
    position: number;
    problemKey: string;
    pid: string;
    title: string;
    difficulty: number | null;
    tags: string[];
  }>;
}

export function importProblemList(input: ImportedListInput): LocalProblemListDetail {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  let listId = 0;
  try {
    db.prepare(`
      INSERT INTO problem_lists (
        platform, external_id, name, description, provider, url,
        problem_count, mark_count, imported_at, updated_at
      ) VALUES ('luogu', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, external_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        provider = excluded.provider,
        url = excluded.url,
        problem_count = excluded.problem_count,
        mark_count = excluded.mark_count,
        updated_at = excluded.updated_at
    `).run(
      input.externalId,
      input.name,
      input.description,
      input.provider,
      input.url,
      input.problemCount,
      input.markCount,
      now,
      now,
    );

    const row = db
      .prepare("SELECT id FROM problem_lists WHERE platform = 'luogu' AND external_id = ?")
      .get(input.externalId) as { id: number };
    listId = Number(row.id);

    db.prepare('DELETE FROM problem_list_items WHERE list_id = ?').run(listId);
    const insert = db.prepare(`
      INSERT INTO problem_list_items (
        list_id, position, problem_key, pid, title, difficulty, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of input.items) {
      insert.run(
        listId,
        item.position,
        item.problemKey,
        item.pid,
        item.title,
        item.difficulty,
        JSON.stringify(item.tags),
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const detail = getProblemListDetail(listId);
  if (!detail) throw new Error('题单写入失败');
  return detail;
}

export function listProblemLists(): LocalProblemList[] {
  const rows = db
    .prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM problem_list_items i WHERE i.list_id = l.id) AS item_count,
        (
          SELECT COUNT(*) FROM problem_list_items i
          WHERE i.list_id = l.id AND EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.problem_key = i.problem_key AND s.verdict = 'AC'
          )
        ) AS solved_count
      FROM problem_lists l
      ORDER BY l.name ASC
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    ...mapList(row),
    problemCount: Number(row.item_count ?? row.problem_count ?? 0),
  }));
}

export function getProblemListDetail(id: number): LocalProblemListDetail | null {
  const row = db
    .prepare("SELECT * FROM problem_lists WHERE id = ? AND platform = 'luogu'")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const itemRows = db
    .prepare(`
      SELECT i.*,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.problem_key = i.problem_key AND s.verdict = 'AC'
          ) THEN 'solved'
          WHEN EXISTS (
            SELECT 1 FROM submissions s WHERE s.problem_key = i.problem_key
          ) THEN 'attempted'
          ELSE 'todo'
        END AS user_status
      FROM problem_list_items i
      WHERE i.list_id = ?
      ORDER BY i.position ASC
    `)
    .all(id) as Array<Record<string, unknown>>;

  const items: ProblemListItem[] = itemRows.map((item) => ({
    position: Number(item.position),
    problemKey: String(item.problem_key),
    pid: String(item.pid),
    title: String(item.title),
    difficulty: item.difficulty === null ? null : Number(item.difficulty),
    tags: parseTags(item.tags_json),
    status: String(item.user_status) as 'todo' | 'attempted' | 'solved',
    url: `https://www.luogu.com.cn/problem/${item.pid}`,
  }));

  const list = mapList(row);
  return {
    ...list,
    problemCount: items.length,
    solvedCount: items.filter((item) => item.status === 'solved').length,
    items,
  };
}

export function deleteProblemList(id: number): void {
  db.prepare("DELETE FROM problem_lists WHERE id = ? AND platform = 'luogu'").run(id);
}

export function getListItem(id: number, problemKey?: string): ProblemListItem[] {
  const detail = getProblemListDetail(id);
  if (!detail) return [];
  return problemKey
    ? detail.items.filter((item) => item.problemKey === problemKey)
    : detail.items;
}

export function addItemsToList(
  listId: number,
  items: Array<{
    problemKey: string;
    pid: string;
    title: string;
    difficulty: number | null;
    tags: string[];
  }>,
): LocalProblemListDetail {
  const row = db
    .prepare("SELECT id FROM problem_lists WHERE id = ? AND platform = 'luogu'")
    .get(listId) as { id: number } | undefined;
  if (!row) throw new Error('题单不存在');

  const maxRow = db
    .prepare('SELECT COALESCE(MAX(position), 0) AS max_position FROM problem_list_items WHERE list_id = ?')
    .get(listId) as { max_position: number };

  const insert = db.prepare(`
    INSERT INTO problem_list_items (
      list_id, position, problem_key, pid, title, difficulty, tags_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(list_id, problem_key) DO UPDATE SET
      title = excluded.title,
      difficulty = excluded.difficulty,
      tags_json = excluded.tags_json
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    let position = Number(maxRow.max_position ?? 0);
    for (const item of items) {
      const exists = db
        .prepare('SELECT 1 FROM problem_list_items WHERE list_id = ? AND problem_key = ?')
        .get(listId, item.problemKey);
      if (!exists) position += 1;
      insert.run(
        listId,
        exists ? 0 : position,
        item.problemKey,
        item.pid,
        item.title,
        item.difficulty,
        JSON.stringify(item.tags),
      );
    }
    db.prepare(`
      UPDATE problem_lists
      SET problem_count = (SELECT COUNT(*) FROM problem_list_items WHERE list_id = ?),
          updated_at = ?
      WHERE id = ?
    `).run(listId, Date.now(), listId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const detail = getProblemListDetail(listId);
  if (!detail) throw new Error('题单更新失败');
  return detail;
}
