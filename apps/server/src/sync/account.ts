import { randomUUID } from 'node:crypto';
import {
  finishAccountRun,
  getAccount,
  getAccountOverview,
  listAccounts,
  recordAccountError,
  replaceAccountSubmissions,
  startAccountRun,
  upsertAccount,
} from '../accounts/db.js';
import type {
  AccountFetchResult,
  AccountOverview,
  AccountSyncResult,
  AccountSubmission,
} from '../accounts/types.js';
import { getProblemBankRefs, type ProblemBankRef } from '../db.js';
import { replaceContestRecords } from '../contests/history.js';
import type { Platform } from '../types.js';
import { fetchAtCoderAccount } from './account-atcoder.js';
import { fetchCodeforcesAccount } from './account-codeforces.js';
import { fetchLuoguAccount } from './luogu.js';
import { describeError } from './http.js';

const fetchers: Record<Platform, (handle: string) => Promise<AccountFetchResult>> = {
  codeforces: fetchCodeforcesAccount,
  atcoder: fetchAtCoderAccount,
  luogu: fetchLuoguAccount,
};

const activeAccounts = new Set<Platform>();

export function normalizeHandle(platform: Platform, input: string): string {
  let handle = input.trim().replace(/^@/, '');
  if (!handle) throw new Error('请填写账号');

  if (platform === 'codeforces') {
    const match = handle.match(/codeforces\.com\/profile\/([^/?#]+)/i);
    if (match) handle = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(handle)) {
      throw new Error('Codeforces handle 格式不正确');
    }
  }

  if (platform === 'atcoder') {
    const match = handle.match(/atcoder\.jp\/users\/([^/?#]+)/i);
    if (match) handle = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(handle)) {
      throw new Error('AtCoder handle 格式不正确');
    }
  }

  if (platform === 'luogu') {
    const match = handle.match(/luogu\.com\.cn\/user\/(\d+)/i) ?? handle.match(/(\d+)/);
    if (!match) throw new Error('洛谷请填写数字 UID，例如 377873');
    handle = match[1];
  }

  return handle;
}

function enrichSubmission(
  submission: AccountSubmission,
  bank: Map<string, ProblemBankRef>,
): AccountSubmission {
  // Codeforces 的提交接口通常已经带题目名、标签和 rating；缺 rating 时再回查题库。
  if (
    submission.problemTitle &&
    submission.problemUrl &&
    submission.tags.length &&
    submission.rating !== null
  ) {
    return submission;
  }
  const problem = bank.get(submission.problemKey);
  if (!problem) return submission;
  return {
    ...submission,
    problemTitle: problem.title ?? submission.problemTitle,
    problemUrl: problem.url ?? submission.problemUrl,
    rating: submission.rating ?? problem.difficulty,
    tags: submission.tags.length ? submission.tags : problem.tags,
  };
}

export async function syncAccount(platform: Platform, rawHandle: string): Promise<AccountSyncResult> {
  if (activeAccounts.has(platform)) {
    throw new Error(`${platform} 账号正在同步，请稍后再试`);
  }
  const handle = normalizeHandle(platform, rawHandle);
  activeAccounts.add(platform);

  const startedAt = Date.now();
  const runId = startAccountRun(platform, handle);
  let fetched = 0;
  let stored = 0;

  try {
    const result = await fetchers[platform](handle);
    fetched = result.submissions.length;

    upsertAccount(result.profile, 'ready');
    const token = `account-${platform}-${Date.now()}-${randomUUID()}`;
    const needsEnrichment = result.submissions.filter(
      (submission) =>
        !submission.problemTitle || !submission.problemUrl || submission.tags.length === 0,
    );
    const bank = getProblemBankRefs(needsEnrichment.map((submission) => submission.problemKey));
    const enriched = result.submissions.map((submission) =>
      enrichSubmission(submission, bank),
    );
    stored = replaceAccountSubmissions(platform, result.profile.handle, token, enriched);
    if (result.contests) {
      replaceContestRecords(platform, result.profile.handle, token, result.contests);
    }

    const account = getAccount(platform);
    if (!account) throw new Error('账号写入失败');
    const durationMs = Date.now() - startedAt;

    finishAccountRun(runId, 'success', fetched, stored, result.note ?? null, startedAt);
    return {
      account,
      fetched,
      stored,
      durationMs,
      note: result.note,
    };
  } catch (error) {
    const message = describeError(error);
    recordAccountError(platform, handle, message);
    finishAccountRun(runId, 'error', fetched, stored, message, startedAt);
    throw new Error(message);
  } finally {
    activeAccounts.delete(platform);
  }
}

export async function syncAllAccounts(): Promise<{
  results: AccountSyncResult[];
  errors: Array<{ platform: Platform; message: string }>;
}> {
  const accounts = listAccounts();
  const results: AccountSyncResult[] = [];
  const errors: Array<{ platform: Platform; message: string }> = [];

  for (const account of accounts) {
    try {
      results.push(await syncAccount(account.platform, account.handle));
    } catch (error) {
      errors.push({
        platform: account.platform,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results, errors };
}

export function getOverview(): AccountOverview {
  return getAccountOverview();
}
