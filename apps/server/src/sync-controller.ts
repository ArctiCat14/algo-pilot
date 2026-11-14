import { syncProblemBank, type ProblemSyncSummary } from './sync/index.js';
import type { Platform, PlatformSyncResult, SyncProgress } from './types.js';

interface SyncStatus {
  running: boolean;
  progress: SyncProgress | null;
  startedAt: number | null;
  finishedAt: number | null;
  results: PlatformSyncResult[];
}

let status: SyncStatus = {
  running: false,
  progress: null,
  startedAt: null,
  finishedAt: null,
  results: [],
};

export function startProblemSync(options: {
  platforms?: Platform[];
  luoguPages?: number;
}): boolean {
  if (status.running) return false;

  const startedAt = Date.now();
  status = {
    running: true,
    progress: null,
    startedAt,
    finishedAt: null,
    results: [],
  };

  void (async () => {
    try {
      const summary: ProblemSyncSummary = await syncProblemBank({
        ...options,
        onProgress: (progress) => {
          status = { ...status, progress };
        },
      });
      status = {
        running: false,
        progress: status.progress,
        startedAt,
        finishedAt: summary.finishedAt,
        results: summary.results,
      };
    } catch (error) {
      status = {
        ...status,
        running: false,
        finishedAt: Date.now(),
      };
      console.error('[sync] 题库同步异常', error);
    }
  })();

  return true;
}

export function getSyncStatus(): SyncStatus {
  return status;
}
