import {
  getProblemTagTotals,
  getSubmissionsForAnalysis,
  type AnalysisSubmission,
} from '../accounts/db.js';
import type {
  DifficultyBucket,
  UntouchedTag,
  WeaknessReport,
  WeaknessTag,
} from './types.js';

const DAY = 86_400_000;

const BUCKETS = [
  { label: '0–999', min: 0, max: 999 },
  { label: '1000–1199', min: 1000, max: 1199 },
  { label: '1200–1399', min: 1200, max: 1399 },
  { label: '1400–1599', min: 1400, max: 1599 },
  { label: '1600–1799', min: 1600, max: 1799 },
  { label: '1800–1999', min: 1800, max: 1999 },
  { label: '2000–2199', min: 2000, max: 2199 },
  { label: '2200–2399', min: 2200, max: 2399 },
  { label: '2400+', min: 2400, max: 10_000 },
];

interface TagAccumulator {
  attempts: number;
  acSubmissions: number;
  attempted: Set<string>;
  solved: Set<string>;
  solvedRatings: Map<string, number>;
  lastAt: number | null;
  failureData: boolean;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildTag(
  tag: string,
  accumulator: TagAccumulator,
  tagTotal: number,
  overallAttemptsPerSolved: number,
  overallAvgDifficulty: number | null,
  now: number,
): WeaknessTag {
  const attempts = accumulator.attempts;
  const attemptedProblems = accumulator.attempted.size;
  const solvedProblems = accumulator.solved.size;
  const solveRate = attemptedProblems ? solvedProblems / attemptedProblems : 0;
  const submissionAcRate = attempts ? accumulator.acSubmissions / attempts : 0;
  const attemptsPerSolved = attempts / Math.max(1, solvedProblems);
  const avgDifficulty = average([...accumulator.solvedRatings.values()]);
  const daysSince =
    accumulator.lastAt === null ? null : Math.floor((now - accumulator.lastAt) / DAY);

  const effortScore = clamp01(1 - (attemptsPerSolved - 1) / 4);
  const difficultyScore =
    avgDifficulty !== null && overallAvgDifficulty
      ? clamp01(avgDifficulty / overallAvgDifficulty)
      : 0.5;
  const recencyScore = daysSince === null ? 0.3 : clamp01(1 - daysSince / 90);
  const mastery = Math.round(
    100 *
      (0.5 * solveRate +
        0.28 * effortScore +
        0.12 * difficultyScore +
        0.1 * recencyScore),
  );

  const reasons: string[] = [];
  if (attempts >= 4 && solveRate < 0.78) {
    reasons.push(`题目通过率 ${percent(solveRate)}，仍有提升空间`);
  }
  if (attempts >= 5 && attemptsPerSolved >= 2.2 && attemptsPerSolved >= overallAttemptsPerSolved * 1.15) {
    reasons.push(`平均 ${attemptsPerSolved.toFixed(1)} 次提交才过一题`);
  }
  if (daysSince !== null && daysSince >= 60) {
    reasons.push(`已经 ${daysSince} 天没有练习这个标签`);
  }
  if (
    avgDifficulty !== null &&
    overallAvgDifficulty !== null &&
    overallAvgDifficulty - avgDifficulty >= 180
  ) {
    reasons.push(`平均难度 ${Math.round(avgDifficulty)}，低于你的整体难度`);
  }
  if (!accumulator.failureData) {
    reasons.push('目前只有 AC 记录，缺少失败样本');
  }
  if (!reasons.length) reasons.push('表现稳定，暂未发现明显短板');

  const confidence =
    attempts >= 10 && attemptedProblems >= 4 && accumulator.failureData
      ? 'high'
      : attempts >= 4 && accumulator.failureData
        ? 'medium'
        : 'low';

  return {
    tag,
    attempts,
    attemptedProblems,
    solvedProblems,
    acSubmissions: accumulator.acSubmissions,
    solveRate,
    submissionAcRate,
    attemptsPerSolved,
    avgDifficulty,
    lastAt: accumulator.lastAt,
    daysSince,
    totalProblems: tagTotal,
    coverage: tagTotal ? solvedProblems / tagTotal : 0,
    mastery,
    weakness: 100 - mastery,
    confidence,
    failureData: accumulator.failureData,
    reasons,
  };
}

export function buildWeaknessReport(): WeaknessReport {
  const submissions = getSubmissionsForAnalysis();
  const tagTotals = getProblemTagTotals();
  const now = Date.now();

  if (!submissions.length) {
    return {
      hasData: false,
      totalSubmissions: 0,
      taggedSubmissions: 0,
      totalSolved: 0,
      lastSubmissionAt: null,
      overallSolveRate: 0,
      overallAttemptsPerSolved: 0,
      overallAvgDifficulty: null,
      tagCoverage: 0,
      weaknesses: [],
      strengths: [],
      radar: [],
      difficulty: [],
      comfortCeiling: null,
      suggestions: [],
      untouched: [],
      sourceNote: '还没有提交记录，请先在账号同步页绑定账号。',
    };
  }

  const solved = new Set<string>();
  const solvedRatings = new Map<string, number>();
  let lastSubmissionAt: number | null = null;
  let taggedSubmissions = 0;
  let acSubmissions = 0;

  const tags = new Map<string, TagAccumulator>();

  for (const submission of submissions) {
    if (submission.submittedAt && (!lastSubmissionAt || submission.submittedAt > lastSubmissionAt)) {
      lastSubmissionAt = submission.submittedAt;
    }
    if (submission.verdict === 'AC') {
      solved.add(submission.problemKey);
      acSubmissions += 1;
      if (submission.rating !== null) solvedRatings.set(submission.problemKey, submission.rating);
    }

    const rowTags = [...new Set(submission.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (!rowTags.length) continue;
    taggedSubmissions += 1;

    for (const tag of rowTags) {
      let accumulator = tags.get(tag);
      if (!accumulator) {
        accumulator = {
          attempts: 0,
          acSubmissions: 0,
          attempted: new Set(),
          solved: new Set(),
          solvedRatings: new Map(),
          lastAt: null,
          failureData: false,
        };
        tags.set(tag, accumulator);
      }
      accumulator.attempts += 1;
      accumulator.attempted.add(submission.problemKey);
      if (submission.submittedAt && (!accumulator.lastAt || submission.submittedAt > accumulator.lastAt)) {
        accumulator.lastAt = submission.submittedAt;
      }
      if (submission.verdict === 'AC') {
        accumulator.acSubmissions += 1;
        accumulator.solved.add(submission.problemKey);
        if (submission.rating !== null) {
          accumulator.solvedRatings.set(submission.problemKey, submission.rating);
        }
      } else {
        accumulator.failureData = true;
      }
    }
  }

  const overallSolveRate = submissions.length ? acSubmissions / submissions.length : 0;
  const overallAttemptsPerSolved = submissions.length / Math.max(1, solved.size);
  const overallAvgDifficulty = average([...solvedRatings.values()]);

  const allTags = [...tags.entries()]
    .map(([tag, accumulator]) =>
      buildTag(
        tag,
        accumulator,
        tagTotals.get(tag) ?? 0,
        overallAttemptsPerSolved,
        overallAvgDifficulty,
        now,
      ),
    )
    .filter((tag) => tag.attempts > 0);

  const candidates = allTags.filter(
    (tag) =>
      tag.failureData &&
      tag.attempts >= 3 &&
      tag.attemptedProblems >= 2 &&
      tag.reasons.some(
        (reason) => !reason.includes('表现稳定') && !reason.includes('缺少失败样本'),
      ),
  );
  if (candidates.length > 1) {
    const rawValues = candidates.map(
      (tag) => 100 - tag.mastery + Math.min(4, tag.attempts / 10),
    );
    const minRaw = Math.min(...rawValues);
    const maxRaw = Math.max(...rawValues);
    const range = Math.max(1, maxRaw - minRaw);
    for (const tag of candidates) {
      const raw = 100 - tag.mastery + Math.min(4, tag.attempts / 10);
      tag.weakness = Math.round(35 + (65 * (raw - minRaw)) / range);
    }
  }

  const weaknesses = [...candidates]
    .sort((a, b) => b.weakness - a.weakness || b.attempts - a.attempts)
    .slice(0, 5);

  const failureStrengths = allTags.filter((tag) => tag.attempts >= 3 && tag.failureData);
  const strengths = (failureStrengths.length ? failureStrengths : allTags.filter((tag) => tag.attempts >= 3))
    .sort((a, b) => b.mastery - a.mastery || b.attempts - a.attempts)
    .slice(0, 6);

  const radar = [...allTags]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 6);

  const difficulty: DifficultyBucket[] = BUCKETS.map((bucket) => {
    const rows = submissions.filter(
      (submission) =>
        submission.rating !== null &&
        submission.rating >= bucket.min &&
        submission.rating <= bucket.max,
    );
    const attemptedProblems = new Set(rows.map((submission) => submission.problemKey));
    const solvedProblems = new Set(
      rows.filter((submission) => submission.verdict === 'AC').map((submission) => submission.problemKey),
    );
    return {
      ...bucket,
      attempts: rows.length,
      attemptedProblems: attemptedProblems.size,
      solvedProblems: solvedProblems.size,
      solveRate: attemptedProblems.size ? solvedProblems.size / attemptedProblems.size : 0,
      attemptsPerSolved: rows.length / Math.max(1, solvedProblems.size),
    };
  }).filter((bucket) => bucket.attempts > 0);

  const comfortBucket = [...difficulty]
    .reverse()
    .find((bucket) => bucket.attempts >= 5 && bucket.solvedProblems >= 3 && bucket.solveRate >= 0.55);

  const suggestions = weaknesses.slice(0, 3).map((tag) => ({
    tag: tag.tag,
    title: `补强 ${tag.tag}`,
    reason: tag.reasons.filter((reason) => !reason.includes('缺少失败样本')).slice(0, 2).join(' · '),
  }));

  const untouched: UntouchedTag[] = [...tagTotals.entries()]
    .filter(([tag, total]) => !tags.has(tag) && total >= 30 && !tag.startsWith('*') && tag !== 'Ad-hoc')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, totalProblems]) => ({ tag, totalProblems }));

  const tagCoverage = tagTotals.size ? tags.size / tagTotals.size : 0;
  const sourceNote = `标签分析基于 ${taggedSubmissions.toLocaleString()} / ${submissions.length.toLocaleString()} 条带标签提交；Codeforces 提供主要失败样本，AtCoder 暂无算法标签，洛谷只记录已通过题目。`;

  return {
    hasData: true,
    totalSubmissions: submissions.length,
    taggedSubmissions,
    totalSolved: solved.size,
    lastSubmissionAt,
    overallSolveRate,
    overallAttemptsPerSolved,
    overallAvgDifficulty,
    tagCoverage,
    weaknesses,
    strengths,
    radar,
    difficulty,
    comfortCeiling: comfortBucket?.label ?? null,
    suggestions,
    untouched,
    sourceNote,
  };
}

export type { AnalysisSubmission };
