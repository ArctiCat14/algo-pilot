import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  Flame,
  Loader2,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { api } from '../api';
import type {
  AccountOverview,
  ContestOverview,
  TaskBoard,
  TrainingTask,
  WeaknessReport,
} from '../types';
import { PLATFORM_INFO } from '../types';
import { formatDateTime, formatNumber } from '../format';

const CONTEST_INFO = {
  codeforces: { label: 'Codeforces', short: 'CF', color: '#ff6b5f' },
  atcoder: { label: 'AtCoder', short: 'AT', color: '#7dd3fc' },
  nowcoder: { label: '牛客', short: 'NC', color: '#5eead4' },
} as const;

const KIND_LABELS = {
  weak: '薄弱补强',
  comfort: '保持手感',
  stretch: '拉伸训练',
  review: '复习',
  manual: '自定义',
} as const;

function countdown(ms: number): string {
  if (ms <= 0) return '进行中';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  return `${Math.max(1, Math.floor(hours))} 小时`;
}

interface DashboardPageProps {
  onNavigate: (view: 'training' | 'weakness' | 'accounts' | 'contests' | 'problems') => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [weakness, setWeakness] = useState<WeaknessReport | null>(null);
  const [contests, setContests] = useState<ContestOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [accountResponse, taskResponse, weaknessResponse, contestResponse] =
        await Promise.all([
          api.accounts(),
          api.tasks(),
          api.weakness(),
          api.contests(false),
        ]);
      setOverview(accountResponse.overview);
      setBoard(taskResponse);
      setWeakness(weaknessResponse);
      setContests(contestResponse);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '总览加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async (task: TrainingTask) => {
    setBusyId(task.id);
    try {
      const result = await api.updateTask(task.id, { status: 'done' });
      setBoard(result.board);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const today = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  const nextContest = [...(contests?.ongoing ?? []), ...(contests?.upcoming ?? [])].sort(
    (a, b) => a.startAt - b.startAt,
  )[0];
  const nextInfo = nextContest ? CONTEST_INFO[nextContest.platform] : null;
  const tasks = board?.tasks ?? [];
  const pendingTasks = tasks.filter((task) => task.status === 'pending').slice(0, 3);
  const week = (overview?.activity ?? []).slice(-7);
  const maxWeek = Math.max(1, ...week.map((day) => day.count));
  const ratings = overview?.accounts.filter(
    (account) => account.rating !== null && account.platform !== 'luogu',
  ) ?? [];

  if (loading) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-loading"><Loader2 size={22} className="spin" /> 正在整理今天的训练台…</div>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            TODAY · {today}
          </div>
          <h1>
            今天，
            <br />
            <span>继续推进。</span>
          </h1>
          <p>
            {overview?.totalSolved
              ? `已经累计过题 ${formatNumber(overview.totalSolved)} 道。今天先把眼前这几道做好。`
              : '先把账号接进来，训练台会自动整理你的过题记录、薄弱点和比赛日程。'}
          </p>
          <div className="dashboard-hero-links">
            <button type="button" onClick={() => onNavigate('training')}>
              打开训练计划 <ArrowRight size={13} />
            </button>
            <button type="button" onClick={() => onNavigate('weakness')}>
              查看薄弱点 <Crosshair size={13} />
            </button>
          </div>
        </div>

        {nextContest && nextInfo ? (
          <a
            className="dashboard-next-contest"
            href={nextContest.url}
            target="_blank"
            rel="noreferrer"
            style={{ '--contest-color': nextInfo.color } as CSSProperties}
          >
            <span>UP NEXT · {nextInfo.label}</span>
            <strong>{nextContest.name}</strong>
            <b>{nextContest.phase === 'ongoing' ? '正在进行' : countdown(nextContest.startAt - Date.now())}</b>
            <small>
              {new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(nextContest.startAt)}
              <ArrowUpRight size={12} />
            </small>
          </a>
        ) : (
          <div className="dashboard-next-contest is-empty">
            <span>UP NEXT</span>
            <strong>近期没有比赛</strong>
            <small>去近期比赛页看看完整赛程。</small>
          </div>
        )}
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>重试</button>
        </div>
      ) : null}

      {!overview?.accounts.length ? (
        <section className="dashboard-onboarding">
          <UserSummaryMissing onNavigate={onNavigate} />
        </section>
      ) : (
        <>
          <section className="dashboard-stats">
            <div className="dashboard-stat">
              <span className="dashboard-stat-icon"><Trophy size={17} /></span>
              <div><span>累计过题</span><strong>{formatNumber(overview.totalSolved)}</strong><small>三平台 AC 题目</small></div>
            </div>
            <div className="dashboard-stat">
              <span className="dashboard-stat-icon"><Target size={17} /></span>
              <div><span>今日进度</span><strong>{board?.stats.done ?? 0} / {board?.stats.total ?? 0}</strong><small>{board?.stats.percent ?? 0}% 完成</small></div>
            </div>
            <div className="dashboard-stat">
              <span className="dashboard-stat-icon"><Clock3 size={17} /></span>
              <div><span>待复习</span><strong>{board?.reviews.length ?? 0}</strong><small>到期复习题</small></div>
            </div>
            <div className="dashboard-stat">
              <span className="dashboard-stat-icon"><Flame size={17} /></span>
              <div><span>连续训练</span><strong>{overview.streak} 天</strong><small>{overview.activeDays} 个活跃日</small></div>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-panel dashboard-today">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">TODAY'S THREE</span>
                  <h2>今日训练</h2>
                </div>
                <button type="button" className="dashboard-link" onClick={() => onNavigate('training')}>
                  全部 <ArrowRight size={12} />
                </button>
              </div>
              {pendingTasks.length ? (
                <div className="dashboard-task-list">
                  {pendingTasks.map((task, index) => (
                    <div className="dashboard-task" key={task.id}>
                      <span className="dashboard-task-index">{String(index + 1).padStart(2, '0')}</span>
                      <div className="dashboard-task-copy">
                        <span className={`dashboard-kind kind-${task.kind}`}>{KIND_LABELS[task.kind]}</span>
                        <a href={task.url} target="_blank" rel="noreferrer">{task.title}</a>
                        <small>{PLATFORM_INFO[task.platform].short} · {task.difficulty ?? '—'} · {task.reason}</small>
                      </div>
                      <button
                        type="button"
                        className="dashboard-complete"
                        onClick={() => void complete(task)}
                        disabled={busyId === task.id}
                        aria-label={`完成 ${task.title}`}
                      >
                        {busyId === task.id ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : tasks.length ? (
                <div className="dashboard-complete-state">
                  <CheckCircle2 size={23} />
                  <strong>今天已经做完了</strong>
                  <span>去复习队列看看，或者去题库自己挑一道。</span>
                  <button type="button" onClick={() => onNavigate('training')}>打开训练计划</button>
                </div>
              ) : (
                <div className="dashboard-complete-state">
                  <Sparkles size={23} />
                  <strong>今天还没有计划</strong>
                  <span>根据薄弱标签和目标 rating 生成三道题。</span>
                  <button type="button" onClick={() => onNavigate('training')}>生成今日计划</button>
                </div>
              )}
            </section>

            <aside className="dashboard-side">
              <section className="dashboard-panel dashboard-weakness">
                <div className="account-panel-head">
                  <div>
                    <span className="eyebrow">WEAK SPOTS</span>
                    <h2>优先补强</h2>
                  </div>
                  <button type="button" className="dashboard-link" onClick={() => onNavigate('weakness')}>
                    详情 <ArrowRight size={12} />
                  </button>
                </div>
                <div className="dashboard-weak-list">
                  {(weakness?.weaknesses ?? []).slice(0, 3).map((tag) => (
                    <button type="button" key={tag.tag} onClick={() => onNavigate('weakness')}>
                      <span>{tag.tag}</span>
                      <div><i style={{ width: `${tag.weakness}%` }} /></div>
                      <b>{tag.weakness}</b>
                    </button>
                  ))}
                  {!weakness?.weaknesses.length ? <p className="dashboard-empty">暂无足够数据。</p> : null}
                </div>
              </section>

              <section className="dashboard-panel dashboard-ratings">
                <div className="account-panel-head">
                  <div>
                    <span className="eyebrow">RATING</span>
                    <h2>当前段位</h2>
                  </div>
                  <button type="button" className="dashboard-link" onClick={() => onNavigate('accounts')}>
                    账号 <ArrowRight size={12} />
                  </button>
                </div>
                <div className="dashboard-rating-list">
                  {ratings.map((account) => (
                    <div key={account.platform}>
                      <span style={{ background: PLATFORM_INFO[account.platform].color }} />
                      <small>{PLATFORM_INFO[account.platform].short}</small>
                      <b>{account.rating}</b>
                      <em>max {account.maxRating ?? '—'}</em>
                    </div>
                  ))}
                  {!ratings.length ? <p className="dashboard-empty">暂无 rating 数据。</p> : null}
                </div>
              </section>
            </aside>
          </div>

          <div className="dashboard-grid dashboard-lower">
            <section className="dashboard-panel dashboard-week">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">LAST 7 DAYS</span>
                  <h2>本周节奏</h2>
                </div>
                <span className="panel-meta">{formatNumber(week.reduce((sum, day) => sum + day.count, 0))} 次提交</span>
              </div>
              <div className="dashboard-week-bars">
                {week.map((day) => (
                  <div key={day.date}>
                    <span>{day.count || ''}</span>
                    <i style={{ height: `${Math.max(4, (day.count / maxWeek) * 100)}%` }} />
                    <small>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${day.date}T00:00:00`))}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-panel dashboard-recent">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">LATEST SUBMISSIONS</span>
                  <h2>最近提交</h2>
                </div>
                <span className="panel-meta">最近 {overview.recent.length} 条</span>
              </div>
              <div className="dashboard-recent-list">
                {overview.recent.slice(0, 5).map((submission) => (
                  <a
                    key={`${submission.platform}-${submission.externalId}`}
                    href={submission.problemUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className={`mini-platform platform-${submission.platform}`}>
                      {PLATFORM_INFO[submission.platform].short}
                    </span>
                    <span>{submission.problemTitle || submission.problemKey}</span>
                    <b className={submission.verdict === 'AC' ? 'is-ac' : ''}>{submission.verdict}</b>
                    <small>{submission.submittedAt ? formatDateTime(submission.submittedAt) : '过题导入'}</small>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      <footer className="page-footer">
        <span>AlgoPilot v1.0 · 训练总览</span>
        <span className="footer-sep" />
        <span>题库 / 账号 / 薄弱点 / 比赛 / 提交 / 训练</span>
        <span className="footer-spacer" />
        <span>数据保存在本机</span>
      </footer>
    </div>
  );
}

function UserSummaryMissing({ onNavigate }: DashboardPageProps) {
  return (
    <div className="dashboard-missing">
      <UserRoundIcon />
      <span className="eyebrow">NO PLAYER PROFILE</span>
      <h2>先把账号接进来</h2>
      <p>绑定 Codeforces、AtCoder 或洛谷账号后，总览会显示过题、rating、提交和训练计划。</p>
      <button type="button" className="primary-sync" onClick={() => onNavigate('accounts')}>
        去绑定账号 <ArrowRight size={15} />
      </button>
    </div>
  );
}

function UserRoundIcon() {
  return (
    <div className="dashboard-missing-icon">
      <Target size={31} />
    </div>
  );
}
