import type { Platform } from '../types.js';

export type UpsolvePlatform =
  | Platform
  | 'nowcoder'
  | 'codechef'
  | 'acwing'
  | 'vjudge'
  | 'other';
export type UpsolveKind = 'problem' | 'contest';
export type UpsolveStatus = 'todo' | 'doing' | 'done';

export interface UpsolveItem {
  id: number;
  url: string;
  kind: UpsolveKind;
  platform: UpsolvePlatform;
  problemKey: string | null;
  contestKey: string | null;
  contestName: string | null;
  title: string;
  difficulty: number | null;
  tags: string[];
  note: string | null;
  priority: number;
  status: UpsolveStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface UpsolveStats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  weekDone: number;
}

export interface UpsolveContestGroup {
  key: string;
  name: string;
  platform: UpsolvePlatform;
  url: string | null;
  total: number;
  todo: number;
  doing: number;
  done: number;
}

export interface UpsolveBoard {
  items: UpsolveItem[];
  stats: UpsolveStats;
  tags: Array<{ tag: string; count: number }>;
  contests: UpsolveContestGroup[];
}
