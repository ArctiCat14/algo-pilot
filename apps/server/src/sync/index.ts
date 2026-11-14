import { randomUUID } from 'node:crypto';
import {
  finishSyncRun,
  replacePlatformProblems,
  setSyncState,
  startSyncRun,
} from '../db.js';
import type { Platform, PlatformSyncResult, ProblemRecord, SyncProgress } from '../types.js';
import { PLATFORMS } from '../types.js';
import { fetchAtCoderProblems } from './atcoder.js';
import { fetchCodeforcesProblems } from './codeforces.js';
import { fetchLuoguProblems } from './luogu.js';
import { describeError } from './http.js';

export interface ProblemSyncOptions {
  platforms?: Platform[];
  luoguPages?: number;
  luoguConcurrency?: number;
  onProgress?: (progress: SyncProgress) => void;
}

export interface ProblemSyncSummary {
  results: PlatformSyncResult[];
  startedAt: number;
  finishedAt: number;
  totalStored: number;
}

const fetchers: Record<
  Platform,
  (onProgress: (progress: SyncProgress) => void, options: ProblemSyncOptions) => Promise<ProblemRecord[]>
> = {
  codeforces: (onProgress) => fetchCodeforcesProblems(onProgress),
  atcoder: (onProgress) => fetchAtCoderProblems(onProgress),
  luogu: (onProgress, options) =>
    fetchLuoguProblems(onProgress, {
      pages: options.luoguPages,
      concurrency: options.luoguConcurrency,
    }),
};

export async function syncProblemBank(options: ProblemSyncOptions = {}): Promise<ProblemSyncSummary> {
  const platforms = options.platforms?.length ? options.platforms : [...PLATFORMS];
  const startedAt = Date.now();
  const results: PlatformSyncResult[] = [];

  for (const platform of platforms) {
    const runId = startSyncRun(platform);
    const platformStartedAt = Date.now();
    const token = `${platform}-${Date.now()}-${randomUUID()}`;
    const onProgress = (progress: SyncProgress): void => options.onProgress?.(progress);

    try {
      onProgress({
        platform,
        phase: 'fetching',
        current: 0,
        total: null,
        message: '开始同步',
      });

      const problems = await fetchers[platform](onProgress, options);
      if (!problems.length) throw new Error('没有获取到任何题目');

      onProgress({
        platform,
        phase: 'writing',
        current: 0,
        total: problems.length,
        message: `正在写入 ${problems.length.toLocaleString()} 道题`,
      });

      const stored = replacePlatformProblems(platform, token, problems);
      const durationMs = Date.now() - platformStartedAt;
      const message = `同步 ${problems.length.toLocaleString()} 道题`
        + (platform === 'luogu' && options.luoguPages ? '（限量模式）' : '');

      finishSyncRun(runId, 'success', problems.length, stored, message, platformStartedAt);
      setSyncState(`problems:last_sync:${platform}`, {
        at: Date.now(),
        count: problems.length,
        stored,
        durationMs,
      });

      const result: PlatformSyncResult = {
        platform,
        status: 'success',
        fetched: problems.length,
        stored,
        durationMs,
        message,
      };
      results.push(result);
      onProgress({
        platform,
        phase: 'done',
        current: problems.length,
        total: problems.length,
        message,
      });
    } catch (error) {
      const message = describeError(error);
      const durationMs = Date.now() - platformStartedAt;
      finishSyncRun(runId, 'error', 0, 0, message, platformStartedAt);
      results.push({
        platform,
        status: 'error',
        fetched: 0,
        stored: 0,
        durationMs,
        message,
      });
      onProgress({
        platform,
        phase: 'error',
        current: 0,
        total: null,
        message,
      });
    }
  }

  const finishedAt = Date.now();
  return {
    results,
    startedAt,
    finishedAt,
    totalStored: results.reduce((sum, result) => sum + result.stored, 0),
  };
}
