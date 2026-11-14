import type { ContestRecord } from './types.js';
import { fetchJson } from '../sync/http.js';

interface CodeforcesContest {
  id: number;
  name: string;
  type: string;
  phase: string;
  durationSeconds: number;
  startTimeSeconds?: number;
}

interface CodeforcesContestResponse {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: CodeforcesContest[];
}

const DAY = 86_400_000;

export async function fetchCodeforcesContests(): Promise<ContestRecord[]> {
  const payload = await fetchJson<CodeforcesContestResponse>(
    'https://codeforces.com/api/contest.list?gym=false',
    { label: 'Codeforces contests', attempts: 4, timeoutMs: 60_000 },
  );
  if (payload.status !== 'OK') {
    throw new Error(payload.comment ?? 'Codeforces 比赛接口返回异常');
  }

  const now = Date.now();
  const from = now - 30 * DAY;
  const to = now + 60 * DAY;

  return (payload.result ?? [])
    .filter((contest) => {
      if (!contest.startTimeSeconds || contest.startTimeSeconds <= 0) return false;
      const startAt = contest.startTimeSeconds * 1000;
      const endAt = startAt + contest.durationSeconds * 1000;
      return endAt >= from && startAt <= to;
    })
    .map((contest) => ({
      platform: 'codeforces' as const,
      contestId: String(contest.id),
      name: contest.name,
      startAt: contest.startTimeSeconds! * 1000,
      durationSeconds: contest.durationSeconds,
      url: `https://codeforces.com/contest/${contest.id}`,
      note: null,
      source: 'codeforces-api',
    }));
}
