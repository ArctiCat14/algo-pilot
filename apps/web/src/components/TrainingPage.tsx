import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  Lightbulb,
  Loader2,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  Timer,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { TaskBoard, TaskKind, TrainingTask } from '../types';
import { PLATFORM_INFO } from '../types';
import { formatNumber } from '../format';

const KIND_LABELS: Record<TaskKind, string> = {
  weak: '薄弱补强',
  comfort: '保持手感',
  stretch: '拉伸训练',
  review: '复习',
  manual: '自定义',
};

const KIND_COLORS: Record<TaskKind, string> = {
  weak: '#ff8a7e',
  comfort: '#d5ff66',
  stretch: '#7dd3fc',
  review: '#f5b95c',
  manual: '#a78bfa',
};

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(parsed);
}

function formatDue(timestamp: number | null): string {
  if (!timestamp) return '已完成复习';
  const diff = timestamp - Date.now();
  if (diff <= 0) return '现在';
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}

function TaskCard({
  task,
  index,
  notes,
  onNotesChange,
  onSaveNotes,
  onDone,
  onSkip,
  busy,
}: {
  task: TrainingTask;
  index: number;
  notes: string;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
  onDone: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const info = PLATFORM_INFO[task.platform];
  const kindColor = KIND_COLORS[task.kind];
  return (
    <article
      className={`training-task status-${task.status}`}
      style={{ '--kind-color': kindColor } as CSSProperties}
    >
      <div className="training-task-rail">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <i />
      </div>
      <div className="training-task-main">
        <div className="training-task-top">
          <span className="task-kind">{KIND_LABELS[task.kind]}</span>
          <span className="task-platform">
            <i style={{ background: info.color }} />
            {info.short}
          </span>
          <span className="task-difficulty">{task.difficulty ?? '—'}</span>
          {task.status === 'done' ? <span className="task-done-label"><Check size={11} /> 已完成</span> : null}
          {task.status === 'skipped' ? <span className="task-skip-label">已跳过</span> : null}
        </div>
        <a className="training-task-title" href={task.url} target="_blank" rel="noreferrer">
          {task.title}
          <ArrowUpRight size={14} />
        </a>
        <p className="training-task-reason">{task.reason}</p>
        <div className="training-task-tags">
          {task.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
          {!task.tags.length ? <span className="tag-empty">无标签</span> : null}
        </div>
        {task.status === 'pending' ? (
          <>
            <textarea
              className="task-notes"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              onBlur={onSaveNotes}
              placeholder="记一下思路、复杂度或卡点…"
              rows={2}
            />
            <div className="training-task-actions">
              <a href={task.url} target="_blank" rel="noreferrer" className="task-open">
                打开题目 <ArrowUpRight size={12} />
              </a>
              <button type="button" className="task-skip" onClick={onSkip} disabled={busy}>
                跳过
              </button>
              <button type="button" className="task-done" onClick={onDone} disabled={busy}>
                {busy ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                完成
              </button>
            </div>
          </>
        ) : (
          <div className="training-task-done-meta">
            <span><Clock3 size={11} /> {task.completedAt ? new Date(task.completedAt).toLocaleDateString('zh-CN') : '—'}</span>
            {task.status === 'done' ? (
              <span>复习阶段 {task.reviewStage}/6 · 下次 {formatDue(task.reviewDueAt)}</span>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

interface TrainingPageProps {
  onNavigate: (view: 'settings' | 'accounts' | 'problems') => void;
}

export function TrainingPage({ onNavigate }: TrainingPageProps) {
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.tasks();
      setBoard(next);
      setNotes(Object.fromEntries(next.tasks.map((task) => [task.id, task.notes ?? ''])));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '训练计划加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const generate = async (force = false) => {
    if (!board) return;
    if (force && !window.confirm('重新生成会删除今天还没开始的任务，已完成的任务会保留。继续？')) {
      return;
    }
    setGenerating(true);
    try {
      const result = await api.generatePlan(force);
      await load();
      setToast(result.message);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成计划失败');
    } finally {
      setGenerating(false);
    }
  };

  const mark = async (id: number, status: 'done' | 'skipped') => {
    setBusyId(id);
    try {
      const result = await api.updateTask(id, { status });
      setBoard(result.board);
      setToast(status === 'done' ? '已完成，明天会进入复习队列' : '已跳过这道题');
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async (id: number) => {
    if (!board) return;
    const current = board.tasks.find((task) => task.id === id);
    if (!current || (current.notes ?? '') === (notes[id] ?? '')) return;
    try {
      const result = await api.updateTask(id, { notes: notes[id] ?? '' });
      setBoard(result.board);
    } catch {
      setToast('笔记保存失败');
    }
  };

  const review = async (id: number) => {
    setBusyId(id);
    try {
      const result = await api.reviewTask(id);
      setBoard(result.board);
      setToast(`复习完成 · 进入阶段 ${result.task.reviewStage}/6`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '复习更新失败');
    } finally {
      setBusyId(null);
    }
  };

  const doneCount = board?.stats.done ?? 0;
  const total = board?.stats.total ?? 0;
  const percent = board?.stats.percent ?? 0;
  const pending = board?.stats.pending ?? 0;

  return (
    <div className="page training-page">
      <section className="training-hero">
        <div className="training-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            DAILY TRAINING
            <span className="eyebrow-divider" />
            <span>{board ? formatDateLabel(board.date) : '训练计划'}</span>
          </div>
          <h1>
            今天，
            <br />
            <span>练这三道。</span>
          </h1>
          <p>
            根据你的薄弱点、舒适区和目标 rating 生成。
            <br className="desktop-only" />
            做完一道，就把它交给明天的复习队列。
          </p>
        </div>
        <div className="training-hero-actions">
          <div className="training-goal">
            <span>TARGET RATING</span>
            <strong>{board?.settings.targetRating ?? '—'}</strong>
            <small>每日 {board?.settings.dailyGoal ?? '—'} 题</small>
          </div>
          <button
            type="button"
            className={`primary-sync ${generating ? 'is-running' : ''}`}
            onClick={() => void generate(total > 0)}
            disabled={generating || loading}
          >
            {generating ? <Loader2 size={16} className="spin" /> : total > 0 ? <RotateCcw size={16} /> : <Sparkles size={16} />}
            {generating ? '生成中' : total > 0 ? '重新生成计划' : '生成今日计划'}
          </button>
          <button type="button" className="training-settings-link" onClick={() => onNavigate('settings')}>
            <Settings2 size={12} /> 调整训练偏好
          </button>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <X size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      ) : null}

      {toast ? (
        <div className="notice">
          <CheckCircle2 size={16} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)}>关闭</button>
        </div>
      ) : null}

      <section className="training-stats">
        <div className="training-stat">
          <span className="training-stat-icon"><Target size={17} /></span>
          <div>
            <span>今日进度</span>
            <strong>{doneCount} / {total || '—'}</strong>
            <small>{percent}% 已完成</small>
          </div>
        </div>
        <div className="training-stat">
          <span className="training-stat-icon"><Timer size={17} /></span>
          <div>
            <span>待完成</span>
            <strong>{pending}</strong>
            <small>保持节奏</small>
          </div>
        </div>
        <div className="training-stat">
          <span className="training-stat-icon"><RotateCcw size={17} /></span>
          <div>
            <span>待复习</span>
            <strong>{board?.reviews.length ?? 0}</strong>
            <small>到期才出现</small>
          </div>
        </div>
        <div className="training-stat">
          <span className="training-stat-icon"><Flame size={17} /></span>
          <div>
            <span>目标 rating</span>
            <strong>{board?.settings.targetRating ?? '—'}</strong>
            <small>用于选题难度</small>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="training-loading"><Loader2 size={22} className="spin" /> 正在读取今日计划…</div>
      ) : (
        <div className="training-layout">
          <section className="training-main-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">TODAY'S QUEUE</span>
                <h2>今日训练</h2>
              </div>
              <span className="panel-meta">{total ? `${doneCount} 已完成` : '尚未生成'}</span>
            </div>

            {board?.tasks.length ? (
              <div className="training-task-list">
                {board.tasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={index}
                    notes={notes[task.id] ?? ''}
                    onNotesChange={(value) => setNotes((previous) => ({ ...previous, [task.id]: value }))}
                    onSaveNotes={() => void saveNotes(task.id)}
                    onDone={() => void mark(task.id, 'done')}
                    onSkip={() => void mark(task.id, 'skipped')}
                    busy={busyId === task.id}
                  />
                ))}
              </div>
            ) : (
              <div className="training-empty">
                <Sparkles size={28} />
                <h3>今天还没安排题目</h3>
                <p>生成计划会根据薄弱标签、优势标签和目标 rating 选三道题。</p>
                <button type="button" className="primary-sync" onClick={() => void generate(false)} disabled={generating}>
                  <Sparkles size={15} /> 生成今日计划
                </button>
              </div>
            )}
          </section>

          <aside className="training-side">
            <section className="training-progress-card">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">DAILY RHYTHM</span>
                  <h2>今日节奏</h2>
                </div>
                <Flame size={16} className="head-icon" />
              </div>
              <div
                className="daily-ring"
                style={{ '--ring-progress': `${Math.max(0, Math.min(100, percent)) * 3.6}deg` } as CSSProperties}
              >
                <div>
                  <strong>{percent}%</strong>
                  <span>完成</span>
                </div>
              </div>
              <div className="daily-ring-meta">
                <span>{doneCount} 完成</span>
                <span>{pending} 待做</span>
                <span>{board?.stats.skipped ?? 0} 跳过</span>
              </div>
            </section>

            <section className="training-side-card">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">SPACED REVIEW</span>
                  <h2>复习队列</h2>
                </div>
                <RotateCcw size={16} className="head-icon" />
              </div>
              {board?.reviews.length ? (
                <div className="review-list">
                  {board.reviews.map((task) => (
                    <div className="review-item" key={task.id}>
                      <div className="review-item-copy">
                        <a href={task.url} target="_blank" rel="noreferrer">{task.title}</a>
                        <span>阶段 {task.reviewStage}/6 · {formatDue(task.reviewDueAt)}</span>
                      </div>
                      <button type="button" onClick={() => void review(task.id)} disabled={busyId === task.id}>
                        {busyId === task.id ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                        已复习
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="training-side-empty">暂无到期复习。完成一道题后，明天会进入这里。</p>
              )}
            </section>

            <section className="training-side-card">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">RECENT FINISHES</span>
                  <h2>最近完成</h2>
                </div>
                <CheckCircle2 size={16} className="head-icon" />
              </div>
              <div className="training-history">
                {(board?.history ?? []).slice(0, 5).map((task) => (
                  <div className="history-row" key={task.id}>
                    <span className={task.status === 'done' ? 'history-dot is-done' : 'history-dot'} />
                    <span className="history-title">{task.title}</span>
                    <span className="history-date">
                      {task.completedAt ? new Date(task.completedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
                {!board?.history.length ? <p className="training-side-empty">还没有完成记录。</p> : null}
              </div>
            </section>

            <button type="button" className="training-problems-link" onClick={() => onNavigate('problems')}>
              <Lightbulb size={13} />
              去题库自己挑一道题
              <ArrowRight size={12} />
            </button>
          </aside>
        </div>
      )}

      <footer className="page-footer">
        <span>AlgoPilot v0.6 · 训练计划</span>
        <span className="footer-sep" />
        <span>1 / 3 / 7 / 14 / 30 / 60 天间隔复习</span>
        <span className="footer-spacer" />
        <span>{formatNumber(total)} 道今日任务</span>
      </footer>
    </div>
  );
}
