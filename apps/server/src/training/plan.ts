import { buildWeaknessReport } from '../analysis/weakness.js';
import {
  deletePendingTasksForDate,
  findProblemCandidates,
  getRecentTaskKeys,
  getSolvedAndAttemptedKeys,
  getTasksForDate,
  getTrainingSettings,
  hasTasksForDate,
  insertTasks,
  localDateKey,
  type ProblemCandidate,
} from './db.js';
import type { NewTaskRecord } from './db.js';
import type { PlanResult, TaskKind, TrainingTask } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateDailyPlan(force = false): PlanResult {
  const date = localDateKey();
  if (!force && hasTasksForDate(date)) {
    return {
      created: 0,
      tasks: getTasksForDate(date),
      message: '今天已经有训练计划了',
    };
  }
  if (force) deletePendingTasksForDate(date);

  const settings = getTrainingSettings();
  const report = buildWeaknessReport();
  if (!report.hasData) {
    throw new Error('还没有提交数据，先绑定账号后再生成训练计划');
  }

  const { solved, attempted } = getSolvedAndAttemptedKeys();
  const recent = getRecentTaskKeys(7);
  const used = new Set<string>();
  const picked: NewTaskRecord[] = [];
  const target = clamp(settings.targetRating, 800, 3300);
  const platforms = settings.preferredPlatforms;

  const weakTag = report.weaknesses[0]?.tag;
  const secondWeakTag = report.weaknesses[1]?.tag;
  const strengthTag = report.strengths[0]?.tag;
  const fallbackTag = report.radar[0]?.tag;

  const choose = (
    tag: string | undefined,
    minDifficulty: number,
    maxDifficulty: number,
    kind: TaskKind,
    reason: string,
  ): boolean => {
    const attempts: Array<[number, number, string | undefined]> = [
      [minDifficulty, maxDifficulty, tag],
      [minDifficulty - 150, maxDifficulty + 150, tag],
      [minDifficulty, maxDifficulty, undefined],
      [Math.max(600, target - 400), target + 400, undefined],
    ];

    for (const [min, max, currentTag] of attempts) {
      const candidates = findProblemCandidates({
        tag: currentTag,
        min: clamp(Math.round(min), 0, 3500),
        max: clamp(Math.round(max), 0, 3500),
        platforms,
        limit: 80,
      });
      const candidate = candidates.find(
        (item) =>
          !used.has(item.problemKey) &&
          !solved.has(item.problemKey) &&
          !attempted.has(item.problemKey) &&
          !recent.has(item.problemKey),
      );
      if (!candidate) continue;

      used.add(candidate.problemKey);
      picked.push(toRecord(candidate, kind, reason, date));
      return true;
    }
    return false;
  };

  const wanted = settings.dailyGoal;
  const weakReason = weakTag
    ? `薄弱标签「${weakTag}」· 训练优先级 ${report.weaknesses[0]?.weakness ?? 0}`
    : '补强薄弱点 · 建立基础手感';
  if (wanted >= 1) {
    choose(weakTag ?? fallbackTag, target - 200, target - 50, 'weak', weakReason);
  }
  if (wanted >= 2 && strengthTag) {
    choose(
      strengthTag,
      target - 350,
      target - 150,
      'comfort',
      `优势标签「${strengthTag}」· 保持手感`,
    );
  }
  if (wanted >= 3) {
    choose(
      secondWeakTag ?? weakTag ?? fallbackTag,
      target + 50,
      target + 250,
      'stretch',
      `拉伸训练 · 目标难度 ${target + 100}`,
    );
  }
  if (wanted >= 4) {
    choose(
      secondWeakTag ?? weakTag,
      target - 100,
      target + 50,
      'weak',
      '补充薄弱标签训练量',
    );
  }
  if (wanted >= 5) {
    choose(
      undefined,
      target + 100,
      target + 300,
      'stretch',
      '补充一道高于舒适区的题',
    );
  }
  if (wanted >= 6) {
    choose(
      strengthTag,
      target - 100,
      target + 100,
      'comfort',
      '保持手感 · 控制训练强度',
    );
  }

  const created = insertTasks(picked);
  return {
    created: created.length,
    tasks: getTasksForDate(date),
    message: created.length
      ? `已生成 ${created.length} 道训练题`
      : '暂时没有找到符合条件的题目，试试调整目标 rating',
  };
}

function toRecord(
  candidate: ProblemCandidate,
  kind: TaskKind,
  reason: string,
  date: string,
): NewTaskRecord {
  return {
    platform: candidate.platform,
    problemKey: candidate.problemKey,
    title: candidate.title,
    url: candidate.url,
    difficulty: candidate.difficulty,
    tags: candidate.tags,
    reason,
    kind,
    scheduledFor: date,
  };
}

export function getPlanBoard() {
  return getTasksForDate(localDateKey()) as TrainingTask[];
}
