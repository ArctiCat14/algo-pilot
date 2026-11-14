import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOST, PORT, WEB_DIST } from './config.js';
import {
  closeDatabase,
  getDatabaseInfo,
  getDifficultyBuckets,
  getPlatformCounts,
  getRecentRuns,
  getTopTags,
  listProblems,
  type ProblemFilters,
} from './db.js';
import {
  deleteAccount,
  getAccount,
  getAccountOverview,
  getAccountRunSummary,
  listAccounts,
  listSubmissions,
} from './accounts/db.js';
import { syncAccount, syncAllAccounts } from './sync/account.js';
import { buildWeaknessReport } from './analysis/weakness.js';
import { getContestOverview } from './contests/sync.js';
import { getContestHistorySummary, listContestHistory } from './contests/history.js';
import {
  getTaskBoard,
  getTrainingSettings,
  reviewTask,
  saveTrainingSettings,
  updateTaskNotes,
  updateTaskStatus,
} from './training/db.js';
import { generateDailyPlan } from './training/plan.js';
import {
  addListToTrainingPlan,
  addProblemIdsToList,
  discoverLuoguLists,
  getImportedList,
  getImportedLists,
  importCustomProblemList,
  importLuoguList,
  removeImportedList,
} from './lists/service.js';
import { getSyncStatus, startProblemSync } from './sync-controller.js';
import { addUpsolve, getContestUpsolveCandidates, getUpsolve, importContestUpsolve, removeUpsolve, updateUpsolve } from './upsolve/service.js';
import { isPlatform, PLATFORMS, type Platform } from './types.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: undefined,
  },
});

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function parseIntQuery(value: unknown, fallback: number, min: number, max: number): number {
  const raw = firstQueryValue(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

app.get('/api/health', async () => ({
  ok: true,
  service: 'algo-training',
  now: Date.now(),
}));

app.get('/api/meta', async () => {
  const platforms = getPlatformCounts();
  const total = platforms.reduce((sum, row) => sum + row.count, 0);
  const lastSync = platforms.reduce<number | null>((latest, row) => {
    if (row.lastSync === null) return latest;
    return latest === null ? row.lastSync : Math.max(latest, row.lastSync);
  }, null);

  return {
    total,
    platforms,
    tags: getTopTags(),
    difficultyBuckets: getDifficultyBuckets(),
    lastSync,
    sync: getSyncStatus(),
    recentRuns: getRecentRuns(8),
    database: getDatabaseInfo(),
  };
});

app.get<{ Querystring: Record<string, unknown> }>('/api/problems', async (request, reply) => {
  const query = request.query;
  const platformRaw = firstQueryValue(query.platform);
  if (platformRaw && !isPlatform(platformRaw)) {
    return reply.code(400).send({ error: `未知平台：${platformRaw}` });
  }

  const tagsRaw = firstQueryValue(query.tags) ?? firstQueryValue(query.tag);
  const tags = tagsRaw
    ? tagsRaw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const sortRaw = firstQueryValue(query.sort);
  const allowedSorts: ProblemFilters['sort'][] = [
    'default',
    'difficulty_asc',
    'difficulty_desc',
    'acceptance',
    'title',
    'newest',
  ];
  const sort = allowedSorts.includes(sortRaw as ProblemFilters['sort'])
    ? (sortRaw as ProblemFilters['sort'])
    : 'default';

  const statusRaw = firstQueryValue(query.status);
  const allowedStatuses = ['todo', 'attempted', 'solved'] as const;
  const status = allowedStatuses.includes(statusRaw as (typeof allowedStatuses)[number])
    ? (statusRaw as 'todo' | 'attempted' | 'solved')
    : undefined;

  try {
    const result = listProblems({
      platform: platformRaw as Platform | undefined,
      q: firstQueryValue(query.q)?.trim().slice(0, 120) || undefined,
      difficultyMin: query.min !== undefined ? parseIntQuery(query.min, 0, 0, 10_000) : undefined,
      difficultyMax: query.max !== undefined ? parseIntQuery(query.max, 10_000, 0, 10_000) : undefined,
      tags,
      status,
      page: parseIntQuery(query.page, 1, 1, 1_000_000),
      pageSize: parseIntQuery(query.pageSize, 25, 1, 100),
      sort,
    });
    return result;
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: '题库查询失败' });
  }
});

app.get('/api/sync/status', async () => getSyncStatus());

app.get('/api/accounts', async () => ({
  items: listAccounts(),
  overview: getAccountOverview(),
  runs: getAccountRunSummary(),
}));

app.get('/api/weakness', async () => buildWeaknessReport());

app.get<{ Querystring: Record<string, unknown> }>('/api/contests', async (request, reply) => {
  try {
    const force = firstQueryValue(request.query.refresh) === '1';
    return await getContestOverview(force);
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: '比赛数据获取失败' });
  }
});

app.get<{ Querystring: Record<string, unknown> }>('/api/contest-records', async (request, reply) => {
  const platformRaw = firstQueryValue(request.query.platform);
  if (platformRaw && !isPlatform(platformRaw)) {
    return reply.code(400).send({ error: `未知平台：${platformRaw}` });
  }
  const platform = platformRaw as Platform | undefined;
  return {
    items: listContestHistory(platform),
    summary: getContestHistorySummary(platform),
  };
});

app.get('/api/upsolve', async () => getUpsolve());

app.get<{ Querystring: Record<string, unknown> }>('/api/upsolve/contest', async (request, reply) => {
  const platform = firstQueryValue(request.query.platform);
  const contestId = firstQueryValue(request.query.contestId);
  if (!platform || !isPlatform(platform)) {
    return reply.code(400).send({ error: '请选择 Codeforces / AtCoder / 洛谷' });
  }
  if (!contestId?.trim()) return reply.code(400).send({ error: '请输入比赛 ID' });
  return getContestUpsolveCandidates(platform, contestId.trim());
});

app.post<{
  Body: {
    platform?: unknown;
    contestId?: unknown;
    contestName?: unknown;
    onlyUnsolved?: unknown;
  };
}>('/api/upsolve/contest', async (request, reply) => {
  const platform = typeof request.body?.platform === 'string' ? request.body.platform : '';
  const contestId =
    typeof request.body?.contestId === 'string' ? request.body.contestId.trim() : '';
  if (!isPlatform(platform)) {
    return reply.code(400).send({ error: '请选择 Codeforces / AtCoder / 洛谷' });
  }
  if (!contestId) return reply.code(400).send({ error: '请输入比赛 ID' });
  try {
    return importContestUpsolve(
      platform,
      contestId,
      typeof request.body?.contestName === 'string' ? request.body.contestName : undefined,
      request.body?.onlyUnsolved !== false,
    );
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : '比赛补题导入失败',
    });
  }
});

app.post<{
  Body: {
    url?: unknown;
    title?: unknown;
    tags?: unknown;
    difficulty?: unknown;
    note?: unknown;
    priority?: unknown;
  };
}>('/api/upsolve', async (request, reply) => {
  try {
    const url = typeof request.body?.url === 'string' ? request.body.url : '';
    return addUpsolve({
      url,
      title: typeof request.body?.title === 'string' ? request.body.title : undefined,
      tags: request.body?.tags,
      difficulty: request.body?.difficulty,
      note: typeof request.body?.note === 'string' ? request.body.note : undefined,
      priority: request.body?.priority,
    });
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : '添加补题失败',
    });
  }
});

app.patch<{
  Params: { id: string };
  Body: {
    title?: unknown;
    tags?: unknown;
    difficulty?: unknown;
    note?: unknown;
    priority?: unknown;
    status?: unknown;
  };
}>('/api/upsolve/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的补题 ID' });
  try {
    return updateUpsolve(id, request.body ?? {});
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : '更新补题失败',
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/upsolve/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的补题 ID' });
  removeUpsolve(id);
  return { ok: true, board: getUpsolve() };
});

app.get('/api/tasks', async () => getTaskBoard());

app.post<{ Body: { force?: unknown } }>('/api/tasks/generate', async (request, reply) => {
  try {
    return generateDailyPlan(Boolean(request.body?.force));
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成训练计划失败';
    return reply.code(400).send({ error: message });
  }
});

app.patch<{
  Params: { id: string };
  Body: { status?: unknown; notes?: unknown };
}>('/api/tasks/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: '无效的任务 ID' });
  }

  const status = request.body?.status;
  if (status !== undefined && status !== 'done' && status !== 'skipped') {
    return reply.code(400).send({ error: 'status 只能是 done 或 skipped' });
  }
  if (typeof request.body?.notes === 'string') {
    updateTaskNotes(id, request.body.notes);
  }
  const task = status ? updateTaskStatus(id, status) : null;
  if (status && !task) return reply.code(404).send({ error: '任务不存在' });
  return { task, board: getTaskBoard() };
});

app.post<{ Params: { id: string } }>('/api/tasks/:id/review', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: '无效的任务 ID' });
  }
  const task = reviewTask(id);
  if (!task) return reply.code(404).send({ error: '任务不存在或尚未完成' });
  return { task, board: getTaskBoard() };
});

app.get('/api/settings', async () => getTrainingSettings());

app.get('/api/lists', async () => ({ items: getImportedLists() }));

app.get('/api/lists/discover', async (request, reply) => {
  try {
    return { items: await discoverLuoguLists() };
  } catch (error) {
    request.log.warn(error, '洛谷题单目录获取失败');
    return reply.code(502).send({
      error: error instanceof Error ? error.message : '洛谷题单目录获取失败',
    });
  }
});

app.post<{ Body: { input?: unknown } }>('/api/lists/import', async (request, reply) => {
  const input = typeof request.body?.input === 'string' ? request.body.input : '';
  if (!input.trim()) return reply.code(400).send({ error: '请输入洛谷题单 ID 或链接' });
  try {
    return await importLuoguList(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : '题单导入失败';
    return reply.code(400).send({ error: message });
  }
});

app.post<{ Body: { input?: unknown; name?: unknown } }>(
  '/api/lists/custom',
  async (request, reply) => {
    const input = typeof request.body?.input === 'string' ? request.body.input : '';
    const name = typeof request.body?.name === 'string' ? request.body.name : undefined;
    if (!input.trim()) return reply.code(400).send({ error: '请输入洛谷题号' });
    try {
      return await importCustomProblemList(input, name);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '题号导入失败',
      });
    }
  },
);

app.post<{ Params: { id: string }; Body: { input?: unknown } }>(
  '/api/lists/:id/items',
  async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的题单 ID' });
    const input = typeof request.body?.input === 'string' ? request.body.input : '';
    if (!input.trim()) return reply.code(400).send({ error: '请输入洛谷题号' });
    try {
      return await addProblemIdsToList(id, input);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '题号添加失败',
      });
    }
  },
);

app.get<{ Params: { id: string } }>('/api/lists/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的题单 ID' });
  const detail = getImportedList(id);
  if (!detail) return reply.code(404).send({ error: '题单不存在' });
  return detail;
});

app.delete<{ Params: { id: string } }>('/api/lists/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的题单 ID' });
  removeImportedList(id);
  return { ok: true };
});

app.post<{ Params: { id: string }; Body: { problemKey?: unknown } }>(
  '/api/lists/:id/plan',
  async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: '无效的题单 ID' });
    const problemKey =
      typeof request.body?.problemKey === 'string' ? request.body.problemKey : undefined;
    try {
      return addListToTrainingPlan(id, problemKey);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '加入训练计划失败',
      });
    }
  },
);

app.put<{
  Body: {
    targetRating?: unknown;
    dailyGoal?: unknown;
    preferredPlatforms?: unknown;
    accentColor?: unknown;
  };
}>('/api/settings', async (request, reply) => {
  const body = request.body ?? {};
  const targetRating = Number(body.targetRating);
  const dailyGoal = Number(body.dailyGoal);
  if (!Number.isFinite(targetRating) || targetRating < 800 || targetRating > 3500) {
    return reply.code(400).send({ error: '目标 rating 必须在 800–3500 之间' });
  }
  if (!Number.isInteger(dailyGoal) || dailyGoal < 1 || dailyGoal > 6) {
    return reply.code(400).send({ error: '每日题量必须是 1–6 的整数' });
  }
  if (
    !Array.isArray(body.preferredPlatforms) ||
    !body.preferredPlatforms.length ||
    !body.preferredPlatforms.every(isPlatform)
  ) {
    return reply.code(400).send({ error: '至少选择一个训练平台' });
  }
  const accentColor =
    typeof body.accentColor === 'string'
      ? body.accentColor
      : getTrainingSettings().accentColor;
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    return reply.code(400).send({ error: '重点色必须是 #RRGGBB 格式' });
  }
  return saveTrainingSettings({
    targetRating,
    dailyGoal,
    preferredPlatforms: body.preferredPlatforms,
    accentColor,
  });
});

app.post('/api/accounts/sync', async (request, reply) => {
  try {
    const result = await syncAllAccounts();
    return result;
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: '账号同步失败' });
  }
});

app.put<{ Params: { platform: string }; Body: { handle?: unknown } }>(
  '/api/accounts/:platform',
  async (request, reply) => {
    const { platform } = request.params;
    if (!isPlatform(platform)) {
      return reply.code(400).send({ error: '未知平台' });
    }
    const handle = typeof request.body?.handle === 'string' ? request.body.handle : '';
    if (!handle.trim()) {
      return reply.code(400).send({ error: '请填写账号' });
    }

    try {
      const result = await syncAccount(platform, handle);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '账号同步失败';
      request.log.warn({ platform, message }, '账号同步失败');
      return reply.code(400).send({ error: message });
    }
  },
);

app.post<{ Params: { platform: string } }>('/api/accounts/:platform/sync', async (request, reply) => {
  const { platform } = request.params;
  if (!isPlatform(platform)) {
    return reply.code(400).send({ error: '未知平台' });
  }
  const account = getAccount(platform);
  if (!account) return reply.code(404).send({ error: '该平台还没有绑定账号' });

  try {
    return await syncAccount(platform, account.handle);
  } catch (error) {
    const message = error instanceof Error ? error.message : '账号同步失败';
    return reply.code(400).send({ error: message });
  }
});

app.delete<{ Params: { platform: string } }>('/api/accounts/:platform', async (request, reply) => {
  const { platform } = request.params;
  if (!isPlatform(platform)) {
    return reply.code(400).send({ error: '未知平台' });
  }
  deleteAccount(platform);
  return { ok: true };
});

app.get<{ Querystring: Record<string, unknown> }>('/api/submissions', async (request, reply) => {
  const query = request.query;
  const platformRaw = firstQueryValue(query.platform);
  if (platformRaw && !isPlatform(platformRaw)) {
    return reply.code(400).send({ error: `未知平台：${platformRaw}` });
  }

  return listSubmissions({
    platform: platformRaw as Platform | undefined,
    verdict: firstQueryValue(query.verdict)?.toUpperCase() || undefined,
    q: firstQueryValue(query.q)?.trim().slice(0, 120) || undefined,
    page: parseIntQuery(query.page, 1, 1, 1_000_000),
    pageSize: parseIntQuery(query.pageSize, 20, 1, 100),
  });
});

app.get('/api/runs', async () => ({ items: getRecentRuns(20) }));

app.post<{ Body: { platforms?: unknown; luoguPages?: unknown } }>('/api/sync', async (request, reply) => {
  const body = request.body ?? {};
  let platforms: Platform[] = [...PLATFORMS];

  if (body.platforms !== undefined) {
    if (!Array.isArray(body.platforms) || !body.platforms.every(isPlatform)) {
      return reply.code(400).send({ error: 'platforms 必须是 codeforces / atcoder / luogu 数组' });
    }
    platforms = body.platforms;
  }

  let luoguPages: number | undefined;
  if (body.luoguPages !== undefined) {
    const value = Number(body.luoguPages);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      return reply.code(400).send({ error: 'luoguPages 必须是 1-1000 的整数' });
    }
    luoguPages = value;
  }

  if (!startProblemSync({ platforms, luoguPages })) {
    return reply.code(409).send({ error: '已有同步任务正在运行' });
  }

  return reply.code(202).send({ ok: true, platforms });
});

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
  });
}

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not Found' });
  }

  if (request.url.startsWith('/assets/')) {
    return reply.code(404).send({ error: 'Asset Not Found' });
  }

  if (existsSync(resolve(WEB_DIST, 'index.html'))) {
    return reply.sendFile('index.html');
  }

  return reply
    .type('text/html; charset=utf-8')
    .send(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>AlgoPilot</title></head>
<body style="font-family:system-ui;background:#0d1117;color:#e6edf3;padding:48px">
  <h1>AlgoPilot · 题库已就绪</h1>
  <p>前端尚未构建。开发模式请访问 Vite 地址；生产模式请先运行 <code>npm run build</code>。</p>
  <p>API：<a style="color:#7ee787" href="/api/meta">/api/meta</a></p>
</body>
</html>`);
});

const shutdown = async (): Promise<void> => {
  await app.close();
  closeDatabase();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ host: HOST, port: PORT });
  app.log.info(`AlgoPilot server listening at http://${HOST}:${PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
