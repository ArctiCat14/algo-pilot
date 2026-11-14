import type { Contest, ContestOverview, ContestPlatform, ContestRecord, ContestSyncError } from './types.js';
import {
  finishContestRun,
  getContestRunErrors,
  getContestSyncMeta,
  listContestRows,
  replacePlatformContests,
  setContestSyncMeta,
  startContestRun,
} from './db.js';
import { fetchCodeforcesContests } from './codeforces.js';
import { fetchAtCoderContests } from './atcoder.js';
import { fetchNowCoderContests } from './nowcoder.js';
import { describeError } from '../sync/http.js';

const TTL = 10 * 60 * 1000;
const DAY = 86_400_000;

const fetchers: Record<ContestPlatform, () => Promise<ContestRecord[]>> = {
  codeforces: fetchCodeforcesContests,
  atcoder: fetchAtCoderContests,
  nowcoder: fetchNowCoderContests,
};

let refreshing: Promise<ContestSyncError[]> | null = null;

async function syncPlatform(platform: ContestPlatform): Promise<{
  records: ContestRecord[];
  error: ContestSyncError | null;
}> {
  const startedAt = Date.now();
  const runId = startContestRun(platform);
  try {
    const records = await fetchers[platform]();
    if (!records.length) throw new Error('没有解析到比赛数据，页面结构可能已变化');
    const token = `contests-${platform}-${Date.now()}`;
    replacePlatformContests(platform, token, records);
    finishContestRun(runId, 'success', records.length, null, startedAt);
    return { records, error: null };
  } catch (error) {
    const message = describeError(error);
    finishContestRun(runId, 'error', 0, message, startedAt);
    return { records: [], error: { platform, message } };
  }
}

export async function refreshContests(force = false): Promise<{
  refreshed: boolean;
  errors: ContestSyncError[];
}> {
  const meta = getContestSyncMeta();
  if (!force && meta && Date.now() - meta.syncedAt < TTL) {
    return { refreshed: false, errors: meta.errors ?? [] };
  }
  if (refreshing) {
    return { refreshed: true, errors: await refreshing };
  }

  refreshing = (async () => {
    const results = await Promise.all([
      syncPlatform('codeforces'),
      syncPlatform('atcoder'),
      syncPlatform('nowcoder'),
    ]);
    const errors = results
      .map((result) => result.error)
      .filter((error): error is ContestSyncError => Boolean(error));
    setContestSyncMeta({ syncedAt: Date.now(), errors });
    return errors;
  })().finally(() => {
    refreshing = null;
  });

  return { refreshed: true, errors: await refreshing };
}

function phaseFor(startAt: number, endAt: number, now: number): Contest['phase'] {
  if (startAt > now) return 'upcoming';
  if (endAt > now) return 'ongoing';
  return 'finished';
}

function toContest(record: ContestRecord, now: number): Contest {
  const endAt = record.startAt + record.durationSeconds * 1000;
  return {
    ...record,
    endAt,
    phase: phaseFor(record.startAt, endAt, now),
  };
}

export async function getContestOverview(force = false): Promise<ContestOverview> {
  const errors = force
    ? (await refreshContests(true)).errors
    : (await refreshContests(false)).errors;
  const meta = getContestSyncMeta();

  const now = Date.now();
  const contests = listContestRows()
    .map((record) => toContest(record, now))
    .filter((contest) => {
      if (contest.phase === 'finished') return contest.endAt >= now - 30 * DAY;
      return contest.startAt <= now + 60 * DAY;
    });

  return {
    syncedAt: meta?.syncedAt ?? null,
    stale: !meta || Date.now() - meta.syncedAt > TTL,
    errors,
    upcoming: contests
      .filter((contest) => contest.phase === 'upcoming')
      .sort((a, b) => a.startAt - b.startAt)
      .slice(0, 20),
    ongoing: contests
      .filter((contest) => contest.phase === 'ongoing')
      .sort((a, b) => a.startAt - b.startAt),
    recent: contests
      .filter((contest) => contest.phase === 'finished')
      .sort((a, b) => b.startAt - a.startAt)
      .slice(0, 20),
  };
}

export function contestErrors(): Array<{ platform: ContestPlatform; message: string; at: number }> {
  return getContestRunErrors();
}
