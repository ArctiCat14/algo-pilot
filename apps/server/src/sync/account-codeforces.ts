import type { AccountFetchResult, AccountSubmission, ContestHistoryRecord } from '../accounts/types.js';
import { fetchJson } from './http.js';

interface CodeforcesUser {
  handle: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  titlePhoto?: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  country?: string;
  organization?: string;
}

interface CodeforcesUserInfoResponse {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: CodeforcesUser[];
}

interface CodeforcesProblem {
  contestId?: number;
  index?: string;
  name?: string;
  rating?: number;
  tags?: string[];
}

interface CodeforcesSubmission {
  id: number;
  creationTimeSeconds: number;
  verdict?: string;
  programmingLanguage?: string;
  problem: CodeforcesProblem;
}

interface CodeforcesStatusResponse {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: CodeforcesSubmission[];
}

interface CodeforcesRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

interface CodeforcesRatingResponse {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: CodeforcesRatingChange[];
}

const VERDICTS: Record<string, string> = {
  OK: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  PRESENTATION_ERROR: 'PE',
  IDLENESS_LIMIT_EXCEEDED: 'ILE',
  SECURITY_VIOLATED: 'SV',
  CRASHED: 'CR',
  REJECTED: 'RJ',
  FAILED: 'FAILED',
};

function normalizeVerdict(raw: string | undefined): string {
  if (!raw) return 'UNKNOWN';
  return VERDICTS[raw] ?? raw;
}

export async function fetchCodeforcesAccount(handle: string): Promise<AccountFetchResult> {
  const encoded = encodeURIComponent(handle);
  const [info, status, rating] = await Promise.all([
    fetchJson<CodeforcesUserInfoResponse>(
      `https://codeforces.com/api/user.info?handles=${encoded}`,
      { label: `Codeforces 用户 ${handle}`, attempts: 4 },
    ),
    fetchJson<CodeforcesStatusResponse>(
      `https://codeforces.com/api/user.status?handle=${encoded}&from=1&count=10000`,
      { label: `Codeforces 提交 ${handle}`, attempts: 4, timeoutMs: 90_000 },
    ),
    fetchJson<CodeforcesRatingResponse>(
      `https://codeforces.com/api/user.rating?handle=${encoded}`,
      { label: `Codeforces 比赛 ${handle}`, attempts: 3, timeoutMs: 60_000 },
    ).catch(() => ({ status: 'FAILED' as const, comment: 'rating unavailable', result: [] })),
  ]);

  if (info.status !== 'OK' || !info.result?.length) {
    throw new Error(info.comment ?? `Codeforces 用户 ${handle} 不存在或接口返回异常`);
  }
  if (status.status !== 'OK') {
    throw new Error(status.comment ?? 'Codeforces 提交记录接口返回异常');
  }

  const user = info.result[0];
  const allSubmissions = [...(status.result ?? [])];

  // user.status 一页最多 10000 条；老账号需要继续翻页。
  for (let from = 10_000; from <= 50_000; from += 10_000) {
    if ((status.result ?? []).length < 10_000) break;
    const page = await fetchJson<CodeforcesStatusResponse>(
      `https://codeforces.com/api/user.status?handle=${encoded}&from=${from + 1}&count=10000`,
      { label: `Codeforces 提交 ${handle} 第 ${from / 10_000 + 1} 页`, attempts: 4, timeoutMs: 90_000 },
    );
    if (page.status !== 'OK' || !page.result?.length) break;
    allSubmissions.push(...page.result);
    if (page.result.length < 10_000) break;
  }

  const seen = new Set<number>();
  const submissions: AccountSubmission[] = [];
  for (const item of allSubmissions) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    const problem = item.problem;
    if (!problem?.contestId || !problem.index) continue;
    const problemKey = `cf:${problem.contestId}${problem.index}`;
    submissions.push({
      platform: 'codeforces',
      externalId: String(item.id),
      problemKey,
      problemTitle: problem.name ?? null,
      problemUrl: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`,
      verdict: normalizeVerdict(item.verdict),
      rawVerdict: item.verdict ?? null,
      language: item.programmingLanguage ?? null,
      submittedAt: item.creationTimeSeconds * 1000,
      rating: typeof problem.rating === 'number' ? problem.rating : null,
      tags: Array.isArray(problem.tags) ? [...new Set(problem.tags)] : [],
      source: 'codeforces-api',
    });
  }

  const contests: ContestHistoryRecord[] = (rating.result ?? []).map((item) => ({
    platform: 'codeforces',
    contestId: String(item.contestId),
    name: item.contestName,
    startAt: item.ratingUpdateTimeSeconds * 1000,
    rank: Number(item.rank) || null,
    oldRating: Number(item.oldRating) || null,
    newRating: Number(item.newRating) || null,
    performance: null,
    rated: true,
    source: 'codeforces-api',
  }));

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.handle;
  return {
    profile: {
      platform: 'codeforces',
      handle: user.handle,
      displayName,
      avatarUrl: user.avatar ?? user.titlePhoto ?? null,
      profileUrl: `https://codeforces.com/profile/${encodeURIComponent(user.handle)}`,
      rating: typeof user.rating === 'number' ? user.rating : null,
      maxRating: typeof user.maxRating === 'number' ? user.maxRating : null,
      rank: user.rank ?? user.maxRank ?? null,
      source: 'codeforces-api',
    },
    submissions,
    contests,
    note: `${submissions.length.toLocaleString()} 条提交记录 · ${contests.length} 场 rated 比赛`,
  };
}
