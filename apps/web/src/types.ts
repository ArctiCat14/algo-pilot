export type Platform = 'codeforces' | 'atcoder' | 'luogu';

export interface PlatformInfo {
  label: string;
  short: string;
  color: string;
  site: string;
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  codeforces: { label: 'Codeforces', short: 'CF', color: '#ff6b5f', site: 'https://codeforces.com' },
  atcoder: { label: 'AtCoder', short: 'AT', color: '#7dd3fc', site: 'https://atcoder.jp' },
  luogu: { label: '洛谷', short: 'LG', color: '#a78bfa', site: 'https://www.luogu.com.cn' },
};

export interface Problem {
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
  acceptance: number | null;
  status: 'todo' | 'attempted' | 'solved';
  attempts: number;
  syncedAt: number;
}

export interface ProblemList {
  items: Problem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

export interface SyncStatus {
  running: boolean;
  progress: SyncProgress | null;
  startedAt: number | null;
  finishedAt: number | null;
  results: PlatformSyncResult[];
}

export interface SyncRun {
  id: number;
  platform: Platform;
  status: string;
  fetched: number;
  stored: number;
  message: string | null;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
}

export interface Meta {
  total: number;
  platforms: Array<{ platform: Platform; count: number; lastSync: number | null }>;
  tags: Array<{ tag: string; count: number }>;
  difficultyBuckets: Array<{ bucket: string; min: number; count: number }>;
  lastSync: number | null;
  sync: SyncStatus;
  recentRuns: SyncRun[];
  database: { path: string; size: number };
}

export type SortOption =
  | 'default'
  | 'difficulty_asc'
  | 'difficulty_desc'
  | 'acceptance'
  | 'title'
  | 'newest';

export interface ProblemQuery {
  platform?: Platform;
  q?: string;
  min?: number;
  max?: number;
  tags?: string[];
  status?: 'todo' | 'attempted' | 'solved';
  page: number;
  pageSize: number;
  sort: SortOption;
}

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
  syncedAt: number;
  accountHandle: string;
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
  recent: AccountSubmission[];
  activity: ActivityDay[];
  verdicts: Array<{ verdict: string; count: number }>;
}

export interface AccountSyncResult {
  account: Account;
  fetched: number;
  stored: number;
  durationMs: number;
  note?: string;
}

export interface AccountsResponse {
  items: Account[];
  overview: AccountOverview;
  runs: Array<{
    platform: Platform;
    handle: string;
    status: string;
    fetched: number;
    finished_at: number | null;
  }>;
}

export interface SubmissionQuery {
  platform?: Platform;
  verdict?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface SubmissionList {
  items: AccountSubmission[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WeaknessTag {
  tag: string;
  attempts: number;
  attemptedProblems: number;
  solvedProblems: number;
  acSubmissions: number;
  solveRate: number;
  submissionAcRate: number;
  attemptsPerSolved: number;
  avgDifficulty: number | null;
  lastAt: number | null;
  daysSince: number | null;
  totalProblems: number;
  coverage: number;
  mastery: number;
  weakness: number;
  confidence: 'high' | 'medium' | 'low';
  failureData: boolean;
  reasons: string[];
}

export interface DifficultyBucket {
  label: string;
  min: number;
  max: number;
  attempts: number;
  attemptedProblems: number;
  solvedProblems: number;
  solveRate: number;
  attemptsPerSolved: number;
}

export interface WeaknessSuggestion {
  tag: string;
  title: string;
  reason: string;
}

export interface UntouchedTag {
  tag: string;
  totalProblems: number;
}

export interface WeaknessReport {
  hasData: boolean;
  totalSubmissions: number;
  taggedSubmissions: number;
  totalSolved: number;
  lastSubmissionAt: number | null;
  overallSolveRate: number;
  overallAttemptsPerSolved: number;
  overallAvgDifficulty: number | null;
  tagCoverage: number;
  weaknesses: WeaknessTag[];
  strengths: WeaknessTag[];
  radar: WeaknessTag[];
  difficulty: DifficultyBucket[];
  comfortCeiling: string | null;
  suggestions: WeaknessSuggestion[];
  untouched: UntouchedTag[];
  sourceNote: string;
}

export type ContestPlatform = 'codeforces' | 'atcoder' | 'nowcoder';

export interface Contest {
  platform: ContestPlatform;
  contestId: string;
  name: string;
  startAt: number;
  endAt: number;
  durationSeconds: number;
  url: string;
  note: string | null;
  source: string;
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
  accountHandle: string;
  ratingDelta: number | null;
}

export interface ContestHistorySummary {
  total: number;
  platforms: Array<{ platform: Platform; count: number }>;
  bestRank: number | null;
  maxRating: number | null;
  totalDelta: number;
  firstAt: number | null;
  lastAt: number | null;
}

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

export interface UpsolveContestProblem {
  problemKey: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
  status: 'todo' | 'attempted' | 'solved';
}

export interface UpsolveContestCandidate {
  contestName: string;
  platform: Platform;
  contestId: string;
  problems: UpsolveContestProblem[];
}

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

export interface LuoguTrainingSummary {
  externalId: string;
  name: string;
  provider: string;
  problemCount: number;
  markCount: number;
  type: number;
  url: string;
}

export interface LocalProblemList {
  id: number;
  platform: 'luogu';
  externalId: string;
  name: string;
  provider: string | null;
  url: string;
  problemCount: number;
  solvedCount: number;
  importedAt: number;
  updatedAt: number;
  description: string | null;
  markCount: number;
}

export interface ProblemListItem {
  position: number;
  problemKey: string;
  pid: string;
  title: string;
  difficulty: number | null;
  tags: string[];
  status: 'todo' | 'attempted' | 'solved';
  url: string;
}

export interface LocalProblemListDetail extends LocalProblemList {
  items: ProblemListItem[];
  warnings?: string[];
}
