export const CONTEST_PLATFORMS = ['codeforces', 'atcoder', 'nowcoder'] as const;
export type ContestPlatform = (typeof CONTEST_PLATFORMS)[number];

export interface ContestRecord {
  platform: ContestPlatform;
  contestId: string;
  name: string;
  startAt: number;
  durationSeconds: number;
  url: string;
  note: string | null;
  source: string;
}

export interface Contest extends ContestRecord {
  endAt: number;
  phase: 'upcoming' | 'ongoing' | 'finished';
}

export interface ContestSyncError {
  platform: ContestPlatform;
  message: string;
}

export interface ContestOverview {
  syncedAt: number | null;
  stale: boolean;
  errors: ContestSyncError[];
  upcoming: Contest[];
  ongoing: Contest[];
  recent: Contest[];
}
