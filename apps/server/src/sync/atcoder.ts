import type { ProblemRecord, SyncProgress } from '../types.js';
import { clampDifficulty, tierLabel } from '../types.js';
import { fetchJson } from './http.js';

interface AtCoderProblem {
  id: string;
  contest_id: string;
  problem_index: string;
  name: string;
  title: string;
}

interface AtCoderContest {
  id: string;
  title: string;
}

interface AtCoderDifficultyModel {
  difficulty?: number;
  is_experimental?: boolean;
}

export async function fetchAtCoderProblems(
  onProgress: (progress: SyncProgress) => void,
): Promise<ProblemRecord[]> {
  onProgress({
    platform: 'atcoder',
    phase: 'fetching',
    current: 0,
    total: null,
    message: '正在拉取 AtCoder 题目与难度模型',
  });

  const [problems, models, contests] = await Promise.all([
    fetchJson<AtCoderProblem[]>('https://kenkoooo.com/atcoder/resources/problems.json', {
      label: 'AtCoder problems',
      timeoutMs: 90_000,
      attempts: 5,
    }),
    fetchJson<Record<string, AtCoderDifficultyModel>>(
      'https://kenkoooo.com/atcoder/resources/problem-models.json',
      { label: 'AtCoder problem models', timeoutMs: 90_000, attempts: 5 },
    ),
    fetchJson<AtCoderContest[]>('https://kenkoooo.com/atcoder/resources/contests.json', {
      label: 'AtCoder contests',
      timeoutMs: 90_000,
      attempts: 5,
    }),
  ]);

  const contestNames = new Map(contests.map((contest) => [contest.id, contest.title]));
  const result: ProblemRecord[] = [];

  for (let index = 0; index < problems.length; index += 1) {
    const problem = problems[index];
    if (!problem?.id) continue;

    const separator = problem.id.lastIndexOf('_');
    const idContest = separator > 0 ? problem.id.slice(0, separator) : '';
    // AtCoder Problems 会把每日训练中的复用题归到 adt_* 比赛下。
    // 如果题目前缀本身是真实比赛 ID，优先回到原比赛，避免错误标题和题号。
    const contestId =
      idContest && contestNames.has(idContest) ? idContest : problem.contest_id;
    if (!contestId) continue;

    const derivedIndex =
      separator > 0
        ? problem.id.slice(separator + 1).toUpperCase().replace(/^EX$/, 'Ex')
        : problem.problem_index;
    const problemIndex =
      contestId !== problem.contest_id ? derivedIndex : problem.problem_index;
    const model = models[problem.id];
    const rawDifficulty = typeof model?.difficulty === 'number' ? model.difficulty : null;
    const difficulty = clampDifficulty(rawDifficulty);
    const contestName = contestNames.get(contestId);
    const name = problem.name?.trim() || problem.title?.trim() || problem.id;
    const title = `${problemIndex}. ${name}`;

    result.push({
      platform: 'atcoder',
      problemKey: `at:${problem.id}`,
      externalId: problem.id,
      contestId,
      problemIndex,
      title: contestName ? `${title} · ${contestName}` : title,
      url: `https://atcoder.jp/contests/${contestId}/tasks/${problem.id}`,
      difficulty,
      platformDifficulty: difficulty === null ? null : String(difficulty),
      difficultyLabel: tierLabel(difficulty),
      tags: [],
      totalSubmit: null,
      totalAccepted: null,
      source: 'kenkoooo',
    });

    if (index % 1500 === 0) {
      onProgress({
        platform: 'atcoder',
        phase: 'normalizing',
        current: index,
        total: problems.length,
        message: `正在整理题目 ${index.toLocaleString()} / ${problems.length.toLocaleString()}`,
      });
    }
  }

  onProgress({
    platform: 'atcoder',
    phase: 'normalizing',
    current: problems.length,
    total: problems.length,
    message: `已整理 ${result.length.toLocaleString()} 道题`,
  });
  return result;
}
