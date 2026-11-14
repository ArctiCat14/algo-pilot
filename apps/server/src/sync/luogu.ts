import type {
  AccountFetchResult,
  AccountSubmission,
} from '../accounts/types.js';
import type {
  LuoguTrainingDetail,
  LuoguTrainingSummary,
} from '../lists/types.js';
import type { ProblemRecord, SyncProgress } from '../types.js';
import {
  LUOGU_DIFFICULTY_LABELS,
  luoguDifficultyToRating,
  tierLabel,
} from '../types.js';
import { describeError, sleep } from './http.js';

const BASE_URL = 'https://www.luogu.com.cn';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface LuoguProblem {
  pid: string;
  type?: string;
  name: string;
  difficulty: number;
  tags?: number[];
  totalSubmit?: number;
  totalAccepted?: number;
}

interface LuoguProblemPage {
  problems: {
    perPage: number;
    count: number;
    result: LuoguProblem[];
  };
  filter?: unknown;
}

interface LentilleResponse<T> {
  status: number;
  data?: T;
  error?: string;
}

interface LuoguTrainingRawProblem {
  pid: string;
  name: string;
  difficulty?: number;
  tags?: number[];
}

interface LuoguTrainingRaw {
  id: number;
  name: string;
  description?: string;
  problemCount?: number;
  markCount?: number;
  type?: number;
  provider?: {
    name?: string;
  };
  problems?: LuoguTrainingRawProblem[];
}

interface LuoguTrainingListRaw {
  trainings: {
    result: Array<{
      id: number;
      name: string;
      type?: number;
      problemCount?: number;
      markCount?: number;
      provider?: {
        name?: string;
      };
    }>;
  };
}

interface LuoguProblemDetailRaw {
  pid: string;
  name: string;
  difficulty?: number;
  tags?: number[];
}

interface LuoguProfileData {
  user?: {
    uid?: number;
    name?: string;
    avatar?: string;
    ranking?: number | null;
    eloValue?: number | null;
    passedProblemCount?: number | null;
  };
  gu?: {
    rating?: number | null;
  } | null;
}

interface LuoguPracticeData {
  passed?: LuoguProblem[];
  submitted?: LuoguProblem[];
  privacy?: boolean;
}

class LuoguSession {
  private cookie = '';
  private refreshing: Promise<void> | null = null;

  private captureCookie(response: Response): void {
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (!cookies.length) return;
    const fresh = cookies.map((value) => value.split(';', 1)[0]).filter(Boolean);
    if (fresh.length) {
      this.cookie = fresh.join('; ');
    }
  }

  private async request(
    path: string,
    accept = 'text/html,application/xhtml+xml',
    options: { referer?: string; headers?: Record<string, string> } = {},
  ): Promise<string> {
    const url = `${BASE_URL}${path}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            Accept: accept,
            Referer: options.referer ?? `${BASE_URL}/problem/list`,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...(options.headers ?? {}),
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(35_000),
        });

        this.captureCookie(response);

        if (response.status >= 200 && response.status < 300) {
          return response.text();
        }

        if (response.status === 302 || response.status === 301) {
          await sleep(120);
          continue;
        }

        if (response.status === 401) {
          this.cookie = '';
          await sleep(400);
          continue;
        }

        if (response.status === 429) {
          const wait = 1200 * attempt;
          console.warn(`[sync] 洛谷触发限流，等待 ${wait}ms 后重试`);
          await sleep(wait);
          continue;
        }

        if (response.status === 403 || response.status === 404) {
          throw Object.assign(new Error(`HTTP ${response.status}`), { fatal: true });
        }

        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        if ((error as { fatal?: boolean }).fatal) throw error;
        if (attempt === 6) break;
        await sleep(700 * attempt);
      }
    }

    throw new Error(`洛谷请求失败：${describeError(lastError)}`);
  }

  async getHtml(path: string, referer?: string): Promise<string> {
    await this.ensureCookie();
    return this.request(path, 'text/html,application/xhtml+xml', { referer });
  }

  async getPractice(uid: number, csrf: string): Promise<LentilleResponse<LuoguPracticeData>> {
    await this.ensureCookie();
    const text = await this.request(`/user/${uid}/practice`, 'application/json', {
      referer: `${BASE_URL}/user/${uid}`,
      headers: {
        'X-Csrf-Token': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'X-Lentille-Request': 'content-only',
      },
    });
    return JSON.parse(text) as LentilleResponse<LuoguPracticeData>;
  }

  async getPage(page: number): Promise<LuoguProblemPage> {
    await this.ensureCookie();
    const html = await this.request(`/problem/list?page=${page}&_contentOnly=1`);
    const match = html.match(
      /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (!match) {
      throw new Error(`洛谷第 ${page} 页缺少 lentille-context`);
    }
    const payload = JSON.parse(match[1]) as LentilleResponse<LuoguProblemPage>;
    if (payload.status !== 200 || !payload.data?.problems) {
      throw new Error(`洛谷第 ${page} 页返回异常：${payload.error ?? `status=${payload.status}`}`);
    }
    return payload.data;
  }

  async getTags(): Promise<Map<number, string>> {
    await this.ensureCookie();
    const text = await this.request('/_lfe/tags', 'application/json');
    const payload = JSON.parse(text) as {
      tags?: Array<{ id: number; name: string; type: number }>;
    };
    const tags = new Map<number, string>();
    for (const tag of payload.tags ?? []) {
      if (tag.type === 2 && tag.id > 0) tags.set(tag.id, tag.name);
    }
    return tags;
  }

  private async ensureCookie(): Promise<void> {
    if (this.cookie) return;
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      await this.request('/problem/list?page=1&_contentOnly=1');
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
}

export async function fetchLuoguProblems(
  onProgress: (progress: SyncProgress) => void,
  options: { pages?: number; concurrency?: number } = {},
): Promise<ProblemRecord[]> {
  onProgress({
    platform: 'luogu',
    phase: 'fetching',
    current: 0,
    total: null,
    message: '正在连接洛谷题库',
  });

  const session = new LuoguSession();
  const firstPage = await session.getPage(1);
  const totalPages = Math.ceil(firstPage.problems.count / firstPage.problems.perPage);
  const limitPages = options.pages ? Math.min(options.pages, totalPages) : totalPages;

  let tagMap = new Map<number, string>();
  try {
    tagMap = await session.getTags();
  } catch (error) {
    console.warn(`[sync] 洛谷标签表获取失败，将暂不填充标签：${describeError(error)}`);
  }

  onProgress({
    platform: 'luogu',
    phase: 'fetching',
    current: 1,
    total: limitPages,
    message: `共 ${firstPage.problems.count.toLocaleString()} 道题，${totalPages} 页`,
  });

  const pages: LuoguProblemPage[] = new Array(limitPages);
  pages[0] = firstPage;
  let nextPage = 2;
  let completed = 1;
  let failure: unknown = null;

  const worker = async (): Promise<void> => {
    while (!failure) {
      const page = nextPage;
      nextPage += 1;
      if (page > limitPages) return;
      try {
        pages[page - 1] = await session.getPage(page);
        completed += 1;
        onProgress({
          platform: 'luogu',
          phase: 'fetching',
          current: completed,
          total: limitPages,
          message: `正在抓取洛谷题库 ${completed} / ${limitPages} 页`,
        });
        await sleep(100 + Math.floor(Math.random() * 120));
      } catch (error) {
        failure = error;
        return;
      }
    }
  };

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 4));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failure) throw failure;

  const unique = new Map<string, ProblemRecord>();
  let scanned = 0;
  for (const page of pages) {
    for (const item of page?.problems.result ?? []) {
      scanned += 1;
      if (!item.pid || !item.name || unique.has(item.pid)) continue;
      const rawDifficulty = Number.isFinite(item.difficulty) ? item.difficulty : 0;
      const difficulty = luoguDifficultyToRating(rawDifficulty);
      const tagNames = (item.tags ?? [])
        .map((id) => tagMap.get(id))
        .filter((tag): tag is string => Boolean(tag));

      unique.set(item.pid, {
        platform: 'luogu',
        problemKey: `lg:${item.pid}`,
        externalId: item.pid,
        contestId: null,
        problemIndex: null,
        title: item.name,
        url: `${BASE_URL}/problem/${item.pid}`,
        difficulty,
        platformDifficulty: String(rawDifficulty),
        difficultyLabel: LUOGU_DIFFICULTY_LABELS[rawDifficulty] ?? tierLabel(difficulty),
        tags: [...new Set(tagNames)].sort(),
        totalSubmit: typeof item.totalSubmit === 'number' ? item.totalSubmit : null,
        totalAccepted: typeof item.totalAccepted === 'number' ? item.totalAccepted : null,
        source: 'luogu-public',
      });
    }
  }

  onProgress({
    platform: 'luogu',
    phase: 'normalizing',
    current: scanned,
    total: scanned,
    message: `已整理 ${unique.size.toLocaleString()} 道题`,
  });

  return [...unique.values()];
}

export async function fetchLuoguAccount(handle: string): Promise<AccountFetchResult> {
  if (!/^\d+$/.test(handle)) {
    throw new Error('洛谷账号请填写数字 UID，例如 377873');
  }
  const uid = Number(handle);
  const session = new LuoguSession();
  const profileHtml = await session.getHtml(`/user/${uid}`, `${BASE_URL}/user/${uid}`);
  const profilePayload = parseLentille<LuoguProfileData>(profileHtml);
  const user = profilePayload.user;
  if (!user?.uid || !user.name) {
    throw new Error(`洛谷用户 ${handle} 不存在`);
  }

  const csrf = profileHtml.match(/name="csrf-token" content="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('洛谷页面缺少 CSRF Token，稍后重试');

  const practicePayload = await session.getPractice(uid, csrf);
  if (practicePayload.status !== 200 || !practicePayload.data) {
    throw new Error(practicePayload.error ?? '洛谷做题记录接口返回异常');
  }
  if (practicePayload.data.privacy) {
    throw new Error(`洛谷用户 ${user.name} 未公开做题记录，请先在洛谷隐私设置中公开`);
  }

  const seen = new Set<string>();
  const submissions: AccountSubmission[] = [];
  for (const item of practicePayload.data.passed ?? []) {
    if (!item.pid || seen.has(item.pid)) continue;
    seen.add(item.pid);
    submissions.push({
      platform: 'luogu',
      externalId: `luogu-solved:${item.pid}`,
      problemKey: `lg:${item.pid}`,
      problemTitle: item.name || null,
      problemUrl: `${BASE_URL}/problem/${item.pid}`,
      verdict: 'AC',
      rawVerdict: 'passed',
      language: null,
      submittedAt: null,
      rating: luoguDifficultyToRating(Number(item.difficulty) || 0),
      tags: [],
      source: 'luogu-public',
    });
  }

  const rating =
    typeof profilePayload.gu?.rating === 'number'
      ? profilePayload.gu.rating
      : typeof user.eloValue === 'number'
        ? user.eloValue
        : null;
  const ranking = typeof user.ranking === 'number' ? user.ranking : null;

  return {
    profile: {
      platform: 'luogu',
      handle: String(user.uid),
      displayName: user.name,
      avatarUrl: user.avatar ?? null,
      profileUrl: `${BASE_URL}/user/${user.uid}`,
      rating,
      maxRating: rating,
      rank: ranking ? `#${ranking}` : null,
      source: 'luogu-public',
    },
    submissions,
    note: `${submissions.length.toLocaleString()} 道公开过题（洛谷不提供逐题提交时间）`,
  };
}

export async function fetchLuoguTrainingCatalog(): Promise<LuoguTrainingSummary[]> {
  const session = new LuoguSession();
  const html = await session.getHtml('/training/list?page=1', `${BASE_URL}/training/list`);
  const data = parseLentille<LuoguTrainingListRaw>(html);
  return (data.trainings?.result ?? [])
    .filter((item) => item.id && item.name)
    .map((item) => ({
      externalId: String(item.id),
      name: item.name,
      provider: item.provider?.name ?? '洛谷',
      problemCount: Number(item.problemCount ?? 0),
      markCount: Number(item.markCount ?? 0),
      type: Number(item.type ?? 0),
      url: `${BASE_URL}/training/${item.id}`,
    }));
}

export async function fetchLuoguTrainingDetail(externalId: string): Promise<LuoguTrainingDetail> {
  if (!/^\d+$/.test(externalId)) {
    throw new Error('洛谷题单 ID 必须是数字');
  }
  const session = new LuoguSession();
  const html = await session.getHtml(`/training/${externalId}`, `${BASE_URL}/training/${externalId}`);
  const data = parseLentille<{ training?: LuoguTrainingRaw }>(html);
  const training = data.training;
  if (!training?.id || !training.name) {
    throw new Error('找不到这个洛谷题单，或题单未公开');
  }

  return {
    externalId: String(training.id),
    name: training.name,
    provider: training.provider?.name ?? '洛谷',
    problemCount: Number(training.problemCount ?? training.problems?.length ?? 0),
    markCount: Number(training.markCount ?? 0),
    type: Number(training.type ?? 0),
    url: `${BASE_URL}/training/${training.id}`,
    description: training.description ?? '',
    problems: (training.problems ?? []).map((problem) => ({
      pid: problem.pid,
      name: problem.name,
      difficulty: Number(problem.difficulty ?? 0),
      tags: Array.isArray(problem.tags) ? problem.tags : [],
    })),
  };
}

export async function fetchLuoguProblemDetail(pid: string): Promise<{
  pid: string;
  name: string;
  difficulty: number;
  tags: string[];
}> {
  const session = new LuoguSession();
  const html = await session.getHtml(`/problem/${pid}`, `${BASE_URL}/problem/${pid}`);
  const data = parseLentille<{ problem?: LuoguProblemDetailRaw }>(html);
  const problem = data.problem;
  if (!problem?.pid || !problem.name) {
    throw new Error(`找不到洛谷题目 ${pid}`);
  }
  return {
    pid: problem.pid,
    name: problem.name,
    difficulty: Number(problem.difficulty ?? 0),
    tags: [],
  };
}

function parseLentille<T>(html: string): T {
  const match = html.match(
    /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error('洛谷页面缺少 lentille-context');
  const payload = JSON.parse(match[1]) as LentilleResponse<T>;
  if (payload.status !== 200 || !payload.data) {
    throw new Error(payload.error ?? `洛谷返回异常：status=${payload.status}`);
  }
  return payload.data;
}

