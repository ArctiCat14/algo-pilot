export const PLATFORMS = ['codeforces', 'atcoder', 'luogu'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<
  Platform,
  { label: string; short: string; color: string; site: string }
> = {
  codeforces: {
    label: 'Codeforces',
    short: 'CF',
    color: '#ff6b5f',
    site: 'https://codeforces.com',
  },
  atcoder: {
    label: 'AtCoder',
    short: 'AT',
    color: '#7dd3fc',
    site: 'https://atcoder.jp',
  },
  luogu: {
    label: '洛谷',
    short: 'LG',
    color: '#a78bfa',
    site: 'https://www.luogu.com.cn',
  },
};

export interface ProblemRecord {
  platform: Platform;
  problemKey: string;
  externalId: string;
  contestId: string | null;
  problemIndex: string | null;
  title: string;
  url: string;
  difficulty: number | null;
  platformDifficulty: string | null;
  difficultyLabel: string;
  tags: string[];
  totalSubmit: number | null;
  totalAccepted: number | null;
  source: string;
}

export interface ProblemRow extends ProblemRecord {
  syncedAt: number;
  acceptance: number | null;
}

export interface SyncProgress {
  platform: Platform;
  phase: 'fetching' | 'normalizing' | 'writing' | 'done' | 'error';
  current: number;
  total: number | null;
  message: string;
}

export interface PlatformSyncResult {
  platform: Platform;
  status: 'success' | 'error';
  fetched: number;
  stored: number;
  durationMs: number;
  message: string;
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

export function tierLabel(difficulty: number | null): string {
  if (difficulty === null || !Number.isFinite(difficulty)) return '未定级';
  if (difficulty < 1000) return '入门';
  if (difficulty < 1300) return '普及';
  if (difficulty < 1600) return '普及+';
  if (difficulty < 1900) return '提高';
  if (difficulty < 2200) return '提高+';
  if (difficulty < 2500) return '省选';
  if (difficulty < 2800) return 'NOI';
  return '集训队';
}

export const LUOGU_DIFFICULTY_LABELS: Record<number, string> = {
  0: '暂无评定',
  1: '入门',
  2: '普及−',
  3: '普及/提高−',
  4: '普及+/提高',
  5: '提高+/省选−',
  6: '省选/NOI−',
  7: 'NOI/NOI+/CTSC',
};

const LUOGU_DIFFICULTY_RATING: Record<number, number> = {
  1: 800,
  2: 1000,
  3: 1200,
  4: 1500,
  5: 1800,
  6: 2100,
  7: 2400,
};

export function luoguDifficultyToRating(difficulty: number): number | null {
  return LUOGU_DIFFICULTY_RATING[difficulty] ?? null;
}

export function clampDifficulty(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}
