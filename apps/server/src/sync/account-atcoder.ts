import type {
  AccountFetchResult,
  AccountSubmission,
  ContestHistoryRecord,
} from '../accounts/types.js';
import { fetchJson, sleep } from './http.js';

interface AtCoderSubmission {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  language: string;
  point: number;
  length: number;
  result: string;
  execution_time?: number | null;
}

interface AtCoderRatingHistory {
  IsRated: boolean;
  Place: number;
  OldRating: number;
  NewRating: number;
  Performance: number;
  ContestName: string;
  ContestScreenName?: string;
  EndTime: string;
}

const VERDICTS: Record<string, string> = {
  AC: 'AC',
  WA: 'WA',
  TLE: 'TLE',
  MLE: 'MLE',
  CE: 'CE',
  RE: 'RE',
  OLE: 'OLE',
  IE: 'IE',
  WJ: 'WJ',
  WR: 'WR',
  Judging: 'JUDGING',
};

export async function fetchAtCoderAccount(handle: string): Promise<AccountFetchResult> {
  const encoded = encodeURIComponent(handle);
  const history = await fetchJson<AtCoderRatingHistory[]>(
    `https://atcoder.jp/users/${encoded}/history/json`,
    { label: `AtCoder 用户 ${handle}`, attempts: 4 },
  );

  const submissions: AccountSubmission[] = [];
  const seen = new Set<number>();
  let fromSecond = 0;

  for (let page = 0; page < 100; page += 1) {
    const batch = await fetchJson<AtCoderSubmission[]>(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encoded}&from_second=${fromSecond}`,
      {
        label: `AtCoder 提交 ${handle}（第 ${page + 1} 页）`,
        attempts: 4,
        timeoutMs: 60_000,
      },
    );
    if (!batch.length) break;

    for (const item of batch) {
      if (!item?.id || seen.has(item.id) || !item.problem_id) continue;
      seen.add(item.id);
      const contestId = item.contest_id || inferContestId(item.problem_id);
      submissions.push({
        platform: 'atcoder',
        externalId: String(item.id),
        problemKey: `at:${item.problem_id}`,
        problemTitle: null,
        problemUrl: contestId
          ? `https://atcoder.jp/contests/${contestId}/tasks/${item.problem_id}`
          : null,
        verdict: VERDICTS[item.result] ?? item.result ?? 'UNKNOWN',
        rawVerdict: item.result ?? null,
        language: item.language ?? null,
        submittedAt: item.epoch_second * 1000,
        rating: null,
        tags: [],
        source: 'kenkoooo',
      });
    }

    if (batch.length < 500) break;
    const lastSecond = batch[batch.length - 1].epoch_second;
    if (lastSecond < fromSecond) break;
    fromSecond = lastSecond + 1;
    await sleep(280);
  }

  const last = history.at(-1);
  const maxRating = history.reduce(
    (max, item) => Math.max(max, Number(item.NewRating) || 0),
    0,
  );
  const contests: ContestHistoryRecord[] = history
    .filter((item) => item.ContestScreenName)
    .map((item) => {
      const contestId = (item.ContestScreenName ?? '').split('.')[0];
      return {
        platform: 'atcoder' as const,
        contestId,
        name: item.ContestName,
        startAt: new Date(item.EndTime).getTime(),
        rank: Number(item.Place) || null,
        oldRating: Number(item.OldRating) || null,
        newRating: Number(item.NewRating) || null,
        performance: Number(item.Performance) || null,
        rated: Boolean(item.IsRated),
        source: 'atcoder',
      };
    });

  return {
    profile: {
      platform: 'atcoder',
      handle,
      displayName: handle,
      avatarUrl: null,
      profileUrl: `https://atcoder.jp/users/${encoded}`,
      rating: last ? Number(last.NewRating) : null,
      maxRating: maxRating || null,
      rank: null,
      source: 'atcoder',
    },
    submissions,
    contests,
    note: `${submissions.length.toLocaleString()} 条提交记录 · ${contests.length} 场比赛`,
  };
}

function inferContestId(problemId: string): string {
  const separator = problemId.lastIndexOf('_');
  return separator > 0 ? problemId.slice(0, separator) : '';
}
