import type { ProblemRecord, SyncProgress } from '../types.js';
import { clampDifficulty, tierLabel } from '../types.js';
import { fetchJson } from './http.js';

interface CodeforcesProblem {
  contestId?: number;
  index?: string;
  name?: string;
  type?: string;
  rating?: number;
  tags?: string[];
}

interface CodeforcesProblemsetResponse {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: {
    problems: CodeforcesProblem[];
  };
}

export async function fetchCodeforcesProblems(
  onProgress: (progress: SyncProgress) => void,
): Promise<ProblemRecord[]> {
  onProgress({
    platform: 'codeforces',
    phase: 'fetching',
    current: 0,
    total: null,
    message: '正在拉取 Codeforces problemset',
  });

  const payload = await fetchJson<CodeforcesProblemsetResponse>(
    'https://codeforces.com/api/problemset.problems',
    { label: 'Codeforces problemset', timeoutMs: 90_000, attempts: 5 },
  );

  if (payload.status !== 'OK' || !payload.result) {
    throw new Error(`Codeforces API 返回异常：${payload.comment ?? '缺少 result'}`);
  }

  const raw = payload.result.problems;
  const problems: ProblemRecord[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || !item.contestId || !item.index || !item.name) continue;
    const difficulty = clampDifficulty(item.rating);
    const externalId = `${item.contestId}${item.index}`;
    problems.push({
      platform: 'codeforces',
      problemKey: `cf:${externalId}`,
      externalId,
      contestId: String(item.contestId),
      problemIndex: item.index,
      title: item.name,
      url: `https://codeforces.com/problemset/problem/${item.contestId}/${item.index}`,
      difficulty,
      platformDifficulty: difficulty === null ? null : String(difficulty),
      difficultyLabel: tierLabel(difficulty),
      tags: Array.isArray(item.tags) ? [...new Set(item.tags)].sort() : [],
      totalSubmit: null,
      totalAccepted: null,
      source: 'codeforces-api',
    });

    if (index % 1000 === 0) {
      onProgress({
        platform: 'codeforces',
        phase: 'normalizing',
        current: index,
        total: raw.length,
        message: `正在整理题目 ${index.toLocaleString()} / ${raw.length.toLocaleString()}`,
      });
    }
  }

  onProgress({
    platform: 'codeforces',
    phase: 'normalizing',
    current: raw.length,
    total: raw.length,
    message: `已整理 ${problems.length.toLocaleString()} 道题`,
  });
  return problems;
}
