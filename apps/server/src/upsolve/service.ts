import { getProblemBankRef } from '../db.js';
import type { Platform } from '../types.js';
import {
  deleteUpsolveItem,
  findContestName,
  findUpsolveByUrl,
  getUpsolveBoard,
  getUpsolveItem,
  insertUpsolveItem,
  listContestProblems,
  updateUpsolveItem,
} from './db.js';
import type { UpsolveBoard, UpsolveItem, UpsolvePlatform, UpsolveStatus } from './types.js';

interface DetectedProblem {
  url: string;
  platform: UpsolvePlatform;
  problemKey: string | null;
  fallbackTitle: string;
  contestKey?: string | null;
  contestName?: string | null;
}

function detectProblem(rawInput: string): DetectedProblem {
  const value = rawInput.trim();
  if (!value) throw new Error('请输入题目链接');
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('题目链接格式不正确');
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host.endsWith('codeforces.com')) {
    const direct = path.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/);
    const contest = path.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/);
    const match = direct ?? contest;
    if (match) {
      const contestId = match[1];
      const index = match[2];
      return {
        url: `https://codeforces.com/problemset/problem/${contestId}/${index}`,
        platform: 'codeforces',
        problemKey: `cf:${contestId}${index}`,
        fallbackTitle: `Codeforces ${contestId}${index}`,
        contestKey: `cf:${contestId}`,
        contestName: null,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'codeforces',
      problemKey: null,
      fallbackTitle: 'Codeforces 题目',
    };
  }

  if (host.endsWith('atcoder.jp')) {
    const match = path.match(/^\/contests\/([^/]+)\/tasks\/([^/?#]+)/);
    if (match) {
      const taskId = match[2];
      return {
        url: `https://atcoder.jp/contests/${match[1]}/tasks/${taskId}`,
        platform: 'atcoder',
        problemKey: `at:${taskId}`,
        fallbackTitle: `AtCoder ${taskId}`,
        contestKey: `at:${match[1]}`,
        contestName: null,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'atcoder',
      problemKey: null,
      fallbackTitle: 'AtCoder 题目',
    };
  }

  if (host.endsWith('luogu.com.cn') || host.endsWith('luogu.com')) {
    const match = path.match(/^\/problem\/([A-Za-z0-9_-]+)/);
    if (match) {
      return {
        url: `https://www.luogu.com.cn/problem/${match[1]}`,
        platform: 'luogu',
        problemKey: `lg:${match[1]}`,
        fallbackTitle: `洛谷 ${match[1]}`,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'luogu',
      problemKey: null,
      fallbackTitle: '洛谷题目',
    };
  }

  if (host.endsWith('nowcoder.com')) {
    const contest = path.match(/^\/acm\/contest\/(\d+)\/([A-Za-z0-9_-]+)/);
    const problem = path.match(/^\/acm\/problem\/(\d+)/) ?? path.match(/^\/problem\/(\d+)/);
    if (contest) {
      return {
        url: `https://ac.nowcoder.com/acm/contest/${contest[1]}/${contest[2]}`,
        platform: 'nowcoder',
        problemKey: null,
        fallbackTitle: `牛客 ${contest[1]}/${contest[2]}`,
        contestKey: `nowcoder:${contest[1]}`,
        contestName: `牛客 ${contest[1]}`,
      };
    }
    if (problem) {
      return {
        url: `https://ac.nowcoder.com/acm/problem/${problem[1]}`,
        platform: 'nowcoder',
        problemKey: null,
        fallbackTitle: `牛客 ${problem[1]}`,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'nowcoder',
      problemKey: null,
      fallbackTitle: '牛客题目',
    };
  }

  if (host.endsWith('codechef.com')) {
    const match = path.match(/\/problems\/([A-Za-z0-9_]+)/);
    if (match) {
      return {
        url: parsed.toString(),
        platform: 'codechef',
        problemKey: null,
        fallbackTitle: `CodeChef ${match[1]}`,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'codechef',
      problemKey: null,
      fallbackTitle: 'CodeChef 题目',
    };
  }

  if (host.endsWith('acwing.com')) {
    const match = path.match(/^\/problem\/(?:content\/)?(\d+)/);
    if (match) {
      return {
        url: `https://www.acwing.com/problem/content/${match[1]}/`,
        platform: 'acwing',
        problemKey: null,
        fallbackTitle: `AcWing ${match[1]}`,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'acwing',
      problemKey: null,
      fallbackTitle: 'AcWing 题目',
    };
  }

  if (host.endsWith('vjudge.net')) {
    const match = path.match(/^\/problem\/([^/]+)/);
    if (match) {
      return {
        url: parsed.toString(),
        platform: 'vjudge',
        problemKey: null,
        fallbackTitle: `VJudge ${decodeURIComponent(match[1])}`,
      };
    }
    return {
      url: parsed.toString(),
      platform: 'vjudge',
      problemKey: null,
      fallbackTitle: 'VJudge 题目',
    };
  }

  const segments = path.split('/').filter(Boolean);
  const lastSegment = segments.at(-1) ?? '';
  let readablePath = lastSegment;
  try {
    readablePath = decodeURIComponent(lastSegment).replace(/[-_]+/g, ' ');
  } catch {
    // 保留原始路径即可
  }
  const site = host.replace(/^www\./, '');
  return {
    url: parsed.toString(),
    platform: 'other',
    problemKey: null,
    fallbackTitle: readablePath ? `${site} · ${readablePath}` : site,
  };
}

function parseTags(input: unknown): string[] {
  const values = Array.isArray(input)
    ? input.filter((tag): tag is string => typeof tag === 'string')
    : typeof input === 'string'
      ? input.split(/[,，;；]+/)
      : [];
  const tags: string[] = [];
  for (const value of values) {
    const tag = value.trim().replace(/^#/, '').slice(0, 40);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

function normalizeDifficulty(input: unknown, fallback: number | null): number | null {
  if (input === undefined || input === null || input === '') return fallback;
  const value = Number(input);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(4000, Math.round(value)));
}

export interface AddUpsolveInput {
  url: string;
  title?: string;
  tags?: unknown;
  difficulty?: unknown;
  note?: string;
  priority?: unknown;
}

const CONTEST_PREFIX: Record<Platform, string> = {
  codeforces: 'cf',
  atcoder: 'at',
  luogu: 'lg',
};

const PLATFORM_LABEL: Record<Platform, string> = {
  codeforces: 'Codeforces',
  atcoder: 'AtCoder',
  luogu: '洛谷',
};

function resolveContest(
  detected: DetectedProblem,
): { key: string | null; name: string | null } {
  if (!detected.contestKey) return { key: null, name: null };
  if (detected.contestName) {
    return { key: detected.contestKey, name: detected.contestName };
  }
  const [prefix, ...rest] = detected.contestKey.split(':');
  const contestId = rest.join(':');
  const platform =
    prefix === 'cf' ? 'codeforces' : prefix === 'at' ? 'atcoder' : null;
  const recordName = platform && contestId ? findContestName(platform, contestId) : null;
  const fallback = platform
    ? `${PLATFORM_LABEL[platform]} ${contestId}`
    : detected.contestKey;
  return { key: detected.contestKey, name: recordName ?? fallback };
}

export function addUpsolve(input: AddUpsolveInput): {
  item: UpsolveItem;
  board: UpsolveBoard;
} {
  const detected = detectProblem(input.url);
  if (findUpsolveByUrl(detected.url)) {
    throw new Error('这道题已经在补题队列里了');
  }

  const bank = detected.problemKey ? getProblemBankRef(detected.problemKey) : null;
  const title = input.title?.trim() || bank?.title || detected.fallbackTitle;
  const tags = parseTags(input.tags);
  const priority = Number(input.priority);
  const contest = resolveContest(detected);
  const item = insertUpsolveItem({
    url: detected.url,
    platform: detected.platform,
    problemKey: detected.problemKey,
    contestKey: contest.key,
    contestName: contest.name,
    title,
    difficulty: normalizeDifficulty(input.difficulty, bank?.difficulty ?? null),
    tags: tags.length ? tags : (bank?.tags ?? []).slice(0, 8),
    note: input.note?.trim() || null,
    priority: Number.isFinite(priority) ? Math.max(0, Math.min(2, Math.round(priority))) : 1,
  });
  return { item, board: getUpsolveBoard() };
}

export function getContestUpsolveCandidates(
  platform: Platform,
  contestId: string,
): {
  contestName: string;
  platform: Platform;
  contestId: string;
  problems: ReturnType<typeof listContestProblems>;
} {
  const name = findContestName(platform, contestId) ?? `${PLATFORM_LABEL[platform]} ${contestId}`;
  return {
    contestName: name,
    platform,
    contestId,
    problems: listContestProblems(platform, contestId),
  };
}

export function importContestUpsolve(
  platform: Platform,
  contestId: string,
  contestName: string | undefined,
  onlyUnsolved: boolean,
): {
  board: UpsolveBoard;
  added: number;
  skipped: number;
  contestName: string;
  total: number;
} {
  const problems = listContestProblems(platform, contestId);
  if (!problems.length) {
    throw new Error('本地题库里没有找到这场比赛的题目');
  }
  const name =
    contestName?.trim() ||
    findContestName(platform, contestId) ||
    `${PLATFORM_LABEL[platform]} ${contestId}`;
  const contestKey = `${CONTEST_PREFIX[platform]}:${contestId}`;
  let added = 0;
  let skipped = 0;
  for (const problem of problems) {
    if (onlyUnsolved && problem.status === 'solved') {
      skipped += 1;
      continue;
    }
    if (findUpsolveByUrl(problem.url)) {
      skipped += 1;
      continue;
    }
    insertUpsolveItem({
      url: problem.url,
      platform,
      problemKey: problem.problemKey,
      contestKey,
      contestName: name,
      title: problem.title,
      difficulty: problem.difficulty,
      tags: problem.tags.slice(0, 8),
      note: null,
      priority: 1,
    });
    added += 1;
  }
  return {
    board: getUpsolveBoard(),
    added,
    skipped,
    contestName: name,
    total: problems.length,
  };
}

export interface UpdateUpsolveInput {
  title?: unknown;
  tags?: unknown;
  difficulty?: unknown;
  note?: unknown;
  priority?: unknown;
  status?: unknown;
}

export function updateUpsolve(
  id: number,
  input: UpdateUpsolveInput,
): { item: UpsolveItem; board: UpsolveBoard } {
  const current = getUpsolveItem(id);
  if (!current) throw new Error('补题记录不存在');

  const status = input.status;
  if (status !== undefined && status !== 'todo' && status !== 'doing' && status !== 'done') {
    throw new Error('无效的状态');
  }
  const priority = Number(input.priority);
  const item = updateUpsolveItem(id, {
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : undefined,
    tags: input.tags !== undefined ? parseTags(input.tags) : undefined,
    difficulty:
      input.difficulty !== undefined
        ? normalizeDifficulty(input.difficulty, current.difficulty)
        : undefined,
    note:
      input.note === undefined
        ? undefined
        : typeof input.note === 'string'
          ? input.note.trim() || null
          : null,
    priority: Number.isFinite(priority)
      ? Math.max(0, Math.min(2, Math.round(priority)))
      : undefined,
    status: status as UpsolveStatus | undefined,
  });
  if (!item) throw new Error('补题记录不存在');
  return { item, board: getUpsolveBoard() };
}

export function removeUpsolve(id: number): void {
  deleteUpsolveItem(id);
}

export function getUpsolve(): UpsolveBoard {
  return getUpsolveBoard();
}
