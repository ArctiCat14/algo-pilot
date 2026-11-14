import type { Platform } from '../types.js';

export interface Account {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  rating: number | null;
  maxRating: number | null;
  rank: string | null;
  solvedCount: number;
  submissionCount: number;
  lastSyncAt: number | null;
  status: string;
  error: string | null;
  source: string | null;
}

export interface AccountProfile {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string;
  rating: number | null;
  maxRating: number | null;
  rank: string | null;
  source: string;
}

export interface AccountSubmission {
  platform: Platform;
  externalId: string;
  problemKey: string;
  problemTitle: string | null;
  problemUrl: string | null;
  verdict: string;
  rawVerdict: string | null;
  language: string | null;
  submittedAt: number | null;
  rating: number | null;
  tags: string[];
  source: string;
}

export interface ContestHistoryRecord {
  platform: Platform;
  contestId: string;
  name: string;
  startAt: number;
  rank: number | null;
  oldRating: number | null;
  newRating: number | null;
  performance: number | null;
  rated: boolean;
  source: string;
}

export interface AccountFetchResult {
  profile: AccountProfile;
  submissions: AccountSubmission[];
  contests?: ContestHistoryRecord[];
  note?: string;
}

export interface AccountSyncResult {
  account: Account;
  fetched: number;
  stored: number;
  durationMs: number;
  note?: string;
}

export interface SubmissionRow extends AccountSubmission {
  syncedAt: number;
  accountHandle: string;
}

export interface SubmissionFilters {
  platform?: Platform;
  verdict?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface SubmissionList {
  items: SubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface AccountOverview {
  totalSolved: number;
  totalSubmissions: number;
  activeDays: number;
  streak: number;
  lastSync: number | null;
  accounts: Account[];
  recent: SubmissionRow[];
  activity: ActivityDay[];
  verdicts: Array<{ verdict: string; count: number }>;
}
