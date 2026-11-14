import { randomUUID } from 'node:crypto';
import {
  addItemsToList,
  deleteProblemList,
  getProblemListDetail,
  importProblemList,
  listProblemLists,
} from './db.js';
import type {
  LocalProblemList,
  LocalProblemListDetail,
  LuoguTrainingSummary,
} from './types.js';
import {
  fetchLuoguProblemDetail,
  fetchLuoguTrainingCatalog,
  fetchLuoguTrainingDetail,
} from '../sync/luogu.js';
import { getProblemBankRef } from '../db.js';
import { getTrainingSettings, insertTasks, localDateKey } from '../training/db.js';
import { luoguDifficultyToRating } from '../types.js';
import type { TrainingTask } from '../training/types.js';

let catalogCache: { at: number; items: LuoguTrainingSummary[] } | null = null;

function cleanDescription(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 1200);
}

export async function discoverLuoguLists(): Promise<LuoguTrainingSummary[]> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60 * 1000) {
    return catalogCache.items;
  }
  const items = await fetchLuoguTrainingCatalog();
  catalogCache = { at: Date.now(), items };
  return items;
}

export async function importLuoguList(rawInput: string): Promise<LocalProblemListDetail> {
  const match = rawInput.trim().match(/(?:training\/)?(\d+)/);
  if (!match) {
    throw new Error('请输入洛谷题单 ID 或题单链接，例如 100');
  }
  const externalId = match[1];
  const training = await fetchLuoguTrainingDetail(externalId);

  const items = training.problems
    .map((problem, index) => {
      const problemKey = `lg:${problem.pid}`;
      const bank = getProblemBankRef(problemKey);
      return {
        position: index + 1,
        problemKey,
        pid: problem.pid,
        title: bank?.title ?? problem.name,
        difficulty: bank?.difficulty ?? luoguDifficultyToRating(problem.difficulty),
        tags: bank?.tags ?? [],
      };
    })
    .filter((item) => item.pid);

  return importProblemList({
    externalId: training.externalId,
    name: training.name,
    description: cleanDescription(training.description || '') || null,
    provider: training.provider,
    url: training.url,
    problemCount: items.length,
    markCount: training.markCount,
    items,
  });
}

export function getImportedLists(): LocalProblemList[] {
  return listProblemLists();
}

export function getImportedList(id: number): LocalProblemListDetail | null {
  return getProblemListDetail(id);
}

export function removeImportedList(id: number): void {
  deleteProblemList(id);
}

function parseProblemIds(input: string): string[] {
  const tokens = input
    .split(/[\s,，;；]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    const match = token.match(/problem\/([A-Za-z0-9_-]+)/i);
    const raw = match?.[1] ?? token;
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(raw)) {
      throw new Error(`无效的洛谷题号：${token}`);
    }
    const normalized = raw.replace(/^[a-z]/, (char) => char.toUpperCase());
    if (!ids.includes(normalized)) ids.push(normalized);
  }
  if (!ids.length) throw new Error('请输入至少一个洛谷题号');
  if (ids.length > 60) throw new Error('一次最多导入 60 道题');
  return ids;
}

async function resolveProblemIds(input: string): Promise<{
  items: Array<{
    problemKey: string;
    pid: string;
    title: string;
    difficulty: number | null;
    tags: string[];
  }>;
  warnings: string[];
}> {
  const ids = parseProblemIds(input);
  const items: Array<{
    problemKey: string;
    pid: string;
    title: string;
    difficulty: number | null;
    tags: string[];
  }> = [];
  const warnings: string[] = [];

  for (const pid of ids) {
    const problemKey = `lg:${pid}`;
    const bank = getProblemBankRef(problemKey);
    if (bank) {
      items.push({
        problemKey,
        pid,
        title: bank.title,
        difficulty: bank.difficulty,
        tags: bank.tags,
      });
      continue;
    }
    try {
      const detail = await fetchLuoguProblemDetail(pid);
      items.push({
        problemKey,
        pid: detail.pid,
        title: detail.name,
        difficulty: luoguDifficultyToRating(detail.difficulty),
        tags: [],
      });
    } catch {
      warnings.push(`找不到 ${pid}`);
    }
  }

  if (!items.length) {
    throw new Error(warnings.length ? warnings.join('；') : '没有找到可导入的题目');
  }
  return { items, warnings };
}

export async function importCustomProblemList(
  input: string,
  name?: string,
): Promise<LocalProblemListDetail> {
  const { items, warnings } = await resolveProblemIds(input);
  const timestamp = Date.now();
  const listName =
    name?.trim().slice(0, 80) ||
    `自定义题单 · ${new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp)}`;

  const detail = importProblemList({
    externalId: `custom-${timestamp}-${randomUUID().slice(0, 8)}`,
    name: listName,
    description: null,
    provider: '自定义',
    url: '',
    problemCount: items.length,
    markCount: 0,
    items: items.map((item, index) => ({ ...item, position: index + 1 })),
  });
  return { ...detail, warnings };
}

export async function addProblemIdsToList(
  listId: number,
  input: string,
): Promise<LocalProblemListDetail> {
  const { items, warnings } = await resolveProblemIds(input);
  const detail = addItemsToList(listId, items);
  return { ...detail, warnings };
}

export function addListToTrainingPlan(
  listId: number,
  problemKey?: string,
): { created: number; tasks: TrainingTask[]; message: string } {
  const detail = getProblemListDetail(listId);
  if (!detail) throw new Error('题单不存在');

  const settings = getTrainingSettings();
  const candidates = (problemKey
    ? detail.items.filter((item) => item.problemKey === problemKey)
    : detail.items
  )
    .filter((item) => item.status !== 'solved')
    .slice(0, problemKey ? 1 : settings.dailyGoal);

  if (!candidates.length) {
    return { created: 0, tasks: [], message: '这个题单里没有待练习的题目' };
  }

  const tasks = insertTasks(
    candidates.map((item) => ({
      platform: 'luogu' as const,
      problemKey: item.problemKey,
      title: item.title,
      url: item.url,
      difficulty: item.difficulty,
      tags: item.tags,
      reason: `洛谷题单「${detail.name}」· 第 ${item.position} 题`,
      kind: 'manual' as const,
      scheduledFor: localDateKey(),
    })),
  );

  return {
    created: tasks.length,
    tasks,
    message: tasks.length
      ? `已加入 ${tasks.length} 道题到今日训练`
      : '这些题目已经在今日计划中',
  };
}
