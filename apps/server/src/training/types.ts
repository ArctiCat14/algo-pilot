import type { Platform } from '../types.js';

export interface TrainingSettings {
  targetRating: number;
  dailyGoal: number;
  preferredPlatforms: Platform[];
  accentColor: string;
}

export type TaskKind = 'weak' | 'comfort' | 'stretch' | 'review' | 'manual';
export type TaskStatus = 'pending' | 'done' | 'skipped';

export interface TrainingTask {
  id: number;
  platform: Platform;
  problemKey: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
  reason: string;
  kind: TaskKind;
  status: TaskStatus;
  scheduledFor: string;
  createdAt: number;
  completedAt: number | null;
  notes: string | null;
  reviewDueAt: number | null;
  reviewStage: number;
}

export interface TaskBoard {
  date: string;
  tasks: TrainingTask[];
  reviews: TrainingTask[];
  history: TrainingTask[];
  settings: TrainingSettings;
  stats: {
    total: number;
    done: number;
    skipped: number;
    pending: number;
    percent: number;
  };
}

export interface PlanResult {
  created: number;
  tasks: TrainingTask[];
  message: string;
}
