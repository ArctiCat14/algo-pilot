import type {
  AccountsResponse,
  AccountSyncResult,
  ContestOverview,
  Meta,
  Platform,
  ProblemList,
  ProblemQuery,
  SyncStatus,
  WeaknessReport,
  SubmissionList,
  SubmissionQuery,
  TaskBoard,
  PlanResult,
  TrainingSettings,
  TrainingTask,
  LuoguTrainingSummary,
  LocalProblemList,
  LocalProblemListDetail,
  ContestHistoryRecord,
  ContestHistorySummary,
  UpsolveBoard,
  UpsolveItem,
  UpsolveContestCandidate,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  meta: (signal?: AbortSignal) => request<Meta>('/api/meta', { signal }),

  problems: (query: ProblemQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.platform) params.set('platform', query.platform);
    if (query.q) params.set('q', query.q);
    if (query.min !== undefined) params.set('min', String(query.min));
    if (query.max !== undefined) params.set('max', String(query.max));
    if (query.tags?.length) params.set('tags', query.tags.join(','));
    if (query.status) params.set('status', query.status);
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sort', query.sort);
    return request<ProblemList>(`/api/problems?${params.toString()}`, { signal });
  },

  syncStatus: (signal?: AbortSignal) => request<SyncStatus>('/api/sync/status', { signal }),

  startSync: (platforms?: string[]) =>
    request<{ ok: boolean }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify(platforms ? { platforms } : {}),
    }),

  accounts: (signal?: AbortSignal) => request<AccountsResponse>('/api/accounts', { signal }),

  connectAccount: (platform: Platform, handle: string) =>
    request<AccountSyncResult>(`/api/accounts/${platform}`, {
      method: 'PUT',
      body: JSON.stringify({ handle }),
    }),

  syncAccount: (platform: Platform) =>
    request<AccountSyncResult>(`/api/accounts/${platform}/sync`, { method: 'POST' }),

  syncAllAccounts: () =>
    request<{
      results: AccountSyncResult[];
      errors: Array<{ platform: Platform; message: string }>;
    }>('/api/accounts/sync', { method: 'POST' }),

  disconnectAccount: (platform: Platform) =>
    request<{ ok: boolean }>(`/api/accounts/${platform}`, { method: 'DELETE' }),

  weakness: (signal?: AbortSignal) => request<WeaknessReport>('/api/weakness', { signal }),

  contests: (refresh = false, signal?: AbortSignal) =>
    request<ContestOverview>(`/api/contests${refresh ? '?refresh=1' : ''}`, { signal }),

  contestRecords: (platform?: Platform, signal?: AbortSignal) =>
    request<{ items: ContestHistoryRecord[]; summary: ContestHistorySummary }>(
      `/api/contest-records${platform ? `?platform=${platform}` : ''}`,
      { signal },
    ),

  upsolve: (signal?: AbortSignal) =>
    request<UpsolveBoard>('/api/upsolve', { signal }),

  addUpsolve: (payload: {
    url: string;
    title?: string;
    tags?: string;
    difficulty?: string;
    note?: string;
    priority?: number;
  }) =>
    request<{ item: UpsolveItem; board: UpsolveBoard }>('/api/upsolve', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUpsolve: (
    id: number,
    patch: {
      title?: string;
      tags?: string;
      difficulty?: string;
      note?: string;
      priority?: number;
      status?: string;
    },
  ) =>
    request<{ item: UpsolveItem; board: UpsolveBoard }>(`/api/upsolve/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteUpsolve: (id: number) =>
    request<{ ok: boolean; board: UpsolveBoard }>(`/api/upsolve/${id}`, {
      method: 'DELETE',
    }),

  contestUpsolveCandidates: (platform: Platform, contestId: string) =>
    request<UpsolveContestCandidate>(
      `/api/upsolve/contest?platform=${platform}&contestId=${encodeURIComponent(contestId)}`,
    ),

  importContestUpsolve: (payload: {
    platform: Platform;
    contestId: string;
    contestName?: string;
    onlyUnsolved?: boolean;
  }) =>
    request<{
      board: UpsolveBoard;
      added: number;
      skipped: number;
      contestName: string;
      total: number;
    }>('/api/upsolve/contest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submissions: (query: SubmissionQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.platform) params.set('platform', query.platform);
    if (query.verdict) params.set('verdict', query.verdict);
    if (query.q) params.set('q', query.q);
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    return request<SubmissionList>(`/api/submissions?${params.toString()}`, { signal });
  },

  tasks: (signal?: AbortSignal) => request<TaskBoard>('/api/tasks', { signal }),

  generatePlan: (force = false) =>
    request<PlanResult>('/api/tasks/generate', {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),

  updateTask: (id: number, patch: { status?: 'done' | 'skipped'; notes?: string }) =>
    request<{ task: TrainingTask | null; board: TaskBoard }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  reviewTask: (id: number) =>
    request<{ task: TrainingTask; board: TaskBoard }>(`/api/tasks/${id}/review`, {
      method: 'POST',
    }),

  settings: (signal?: AbortSignal) =>
    request<TrainingSettings>('/api/settings', { signal }),

  saveSettings: (settings: TrainingSettings) =>
    request<TrainingSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  lists: (signal?: AbortSignal) =>
    request<{ items: LocalProblemList[] }>('/api/lists', { signal }),

  discoverLists: (signal?: AbortSignal) =>
    request<{ items: LuoguTrainingSummary[] }>('/api/lists/discover', { signal }),

  importList: (input: string) =>
    request<LocalProblemListDetail>('/api/lists/import', {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),

  importCustomList: (input: string, name?: string) =>
    request<LocalProblemListDetail>('/api/lists/custom', {
      method: 'POST',
      body: JSON.stringify({ input, name }),
    }),

  addListItems: (id: number, input: string) =>
    request<LocalProblemListDetail>(`/api/lists/${id}/items`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),

  listDetail: (id: number, signal?: AbortSignal) =>
    request<LocalProblemListDetail>(`/api/lists/${id}`, { signal }),

  deleteList: (id: number) =>
    request<{ ok: boolean }>(`/api/lists/${id}`, { method: 'DELETE' }),

  addListToPlan: (id: number, problemKey?: string) =>
    request<{ created: number; tasks: TrainingTask[]; message: string }>(
      `/api/lists/${id}/plan`,
      {
        method: 'POST',
        body: JSON.stringify(problemKey ? { problemKey } : {}),
      },
    ),
};
