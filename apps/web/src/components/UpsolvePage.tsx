import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  ContestHistoryRecord,
  Platform,
  UpsolveBoard,
  UpsolveItem,
  UpsolvePlatform,
  UpsolveStatus,
} from '../types';
import { relativeTime } from '../format';

const PLATFORM_META: Record<
  UpsolvePlatform,
  { label: string; short: string; color: string }
> = {
  codeforces: { label: 'Codeforces', short: 'CF', color: '#ff7a6e' },
  atcoder: { label: 'AtCoder', short: 'AT', color: '#7aa7ff' },
  luogu: { label: '洛谷', short: 'LG', color: '#5fd7d7' },
  nowcoder: { label: '牛客', short: 'NC', color: '#ffb35c' },
  codechef: { label: 'CodeChef', short: 'CC', color: '#c084fc' },
  acwing: { label: 'AcWing', short: 'AW', color: '#78c878' },
  vjudge: { label: 'VJudge', short: 'VJ', color: '#9aa0a6' },
  other: { label: '其他平台', short: '—', color: '#9aa0a6' },
};

const STATUS_META: Record<UpsolveStatus, { label: string; icon: typeof Clock3 }> = {
  todo: { label: '待补', icon: Clock3 },
  doing: { label: '进行中', icon: Play },
  done: { label: '已补完', icon: Check },
};

const PRIORITY_META = [
  { label: '高', color: '#ff7a6e' },
  { label: '中', color: '#e3c34a' },
  { label: '低', color: '#8b968d' },
];

const CONTEST_PREFIX: Record<Platform, string> = {
  codeforces: 'cf',
  atcoder: 'at',
  luogu: 'lg',
};

interface AddForm {
  url: string;
  title: string;
  tags: string;
  difficulty: string;
  note: string;
  priority: number;
}

const emptyForm: AddForm = {
  url: '',
  title: '',
  tags: '',
  difficulty: '',
  note: '',
  priority: 1,
};

export function UpsolvePage() {
  const [board, setBoard] = useState<UpsolveBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<UpsolveStatus | 'all'>('todo');
  const [platformFilter, setPlatformFilter] = useState<UpsolvePlatform | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [contestFilter, setContestFilter] = useState('all');
  const [contestOpen, setContestOpen] = useState(false);
  const [contestPlatform, setContestPlatform] = useState<Platform>('codeforces');
  const [contestId, setContestId] = useState('');
  const [contestName, setContestName] = useState('');
  const [onlyUnsolved, setOnlyUnsolved] = useState(true);
  const [importingContest, setImportingContest] = useState(false);
  const [contestRecords, setContestRecords] = useState<ContestHistoryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<UpsolveItem | null>(null);
  const [editForm, setEditForm] = useState<AddForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.upsolve();
      setBoard(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '补题队列加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!form.url.trim()) {
      setError('请先贴一个题目链接');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const response = await api.addUpsolve(form);
      setBoard(response.board);
      setForm(emptyForm);
      setToast(`已加入：${response.item.title}`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : '加入补题队列失败');
    } finally {
      setAdding(false);
    }
  };

  const setStatus = async (item: UpsolveItem, status: UpsolveStatus) => {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await api.updateUpsolve(item.id, { status });
      setBoard(response.board);
      setToast(
        status === 'done'
          ? `已补完：${response.item.title}`
          : status === 'doing'
            ? `开始补：${response.item.title}`
            : `已重新放回队列：${response.item.title}`,
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新状态失败');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (item: UpsolveItem) => {
    setEditing(item);
    setEditForm({
      url: item.url,
      title: item.title,
      tags: item.tags.join(', '),
      difficulty: item.difficulty === null ? '' : String(item.difficulty),
      note: item.note ?? '',
      priority: item.priority,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const response = await api.updateUpsolve(editing.id, {
        title: editForm.title,
        tags: editForm.tags,
        difficulty: editForm.difficulty,
        note: editForm.note,
        priority: editForm.priority,
      });
      setBoard(response.board);
      setEditing(null);
      setToast('补题信息已更新');
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (item: UpsolveItem) => {
    if (!window.confirm(`从补题队列删除《${item.title}》？`)) return;
    setBusyId(item.id);
    try {
      const response = await api.deleteUpsolve(item.id);
      setBoard(response.board);
      setToast('已从补题队列删除');
      if (editing?.id === item.id) setEditing(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  const openContestImport = async () => {
    setContestOpen((open) => !open);
    if (contestRecords.length) return;
    try {
      const response = await api.contestRecords();
      setContestRecords(response.items);
    } catch {
      // 手动输入比赛 ID 仍然可用
    }
  };

  const selectContestRecord = (value: string) => {
    if (!value) return;
    const separator = value.indexOf(':');
    const prefix = value.slice(0, separator);
    const id = value.slice(separator + 1);
    const platform: Platform = prefix === 'at' ? 'atcoder' : 'codeforces';
    const record = contestRecords.find(
      (item) => item.platform === platform && item.contestId === id,
    );
    setContestPlatform(platform);
    setContestId(id);
    setContestName(record?.name ?? '');
  };

  const importContestQueue = async () => {
    if (!contestId.trim()) {
      setError('请输入比赛 ID');
      return;
    }
    setImportingContest(true);
    setError(null);
    try {
      const response = await api.importContestUpsolve({
        platform: contestPlatform,
        contestId: contestId.trim(),
        contestName: contestName.trim() || undefined,
        onlyUnsolved,
      });
      setBoard(response.board);
      setContestFilter(`${CONTEST_PREFIX[contestPlatform]}:${contestId.trim()}`);
      setContestOpen(false);
      setToast(
        `《${response.contestName}》已加入 ${response.added} 道${
          response.skipped ? `，跳过 ${response.skipped} 道` : ''
        }`,
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '比赛补题导入失败');
    } finally {
      setImportingContest(false);
    }
  };

  const items = useMemo(() => board?.items ?? [], [board]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
        if (tagFilter !== 'all' && !item.tags.includes(tagFilter)) return false;
        if (contestFilter !== 'all' && item.contestKey !== contestFilter) return false;
        const text = `${item.title} ${item.url} ${item.tags.join(' ')}`.toLowerCase();
        return !query.trim() || text.includes(query.trim().toLowerCase());
      }),
    [items, statusFilter, platformFilter, tagFilter, contestFilter, query],
  );

  const statusCounts = board?.stats;

  return (
    <div className="page upsolve-page">
      <section className="upsolve-hero">
        <div>
          <div className="hero-eyebrow">
            <span className="live-dot" />
            UPSOLVE QUEUE
            <span className="eyebrow-divider" />
            <span>补题队列</span>
          </div>
          <h1>
            没做出来的，
            <br />
            <span>排队解决。</span>
          </h1>
          <p>
            把比赛里没补的题、平时看到的题先丢进队列。
            <br className="desktop-only" />
            贴链接、打标签、排优先级，补完再划掉。
          </p>
        </div>
        <div className="upsolve-stats">
          <div className="upsolve-stat">
            <span>待补</span>
            <strong>{statusCounts?.todo ?? 0}</strong>
          </div>
          <div className="upsolve-stat">
            <span>进行中</span>
            <strong>{statusCounts?.doing ?? 0}</strong>
          </div>
          <div className="upsolve-stat">
            <span>已补完</span>
            <strong>{statusCounts?.done ?? 0}</strong>
          </div>
          <div className="upsolve-stat">
            <span>近 7 天</span>
            <strong>{statusCounts?.weekDone ?? 0}</strong>
          </div>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
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

      <section className="upsolve-add-panel">
        <div className="upsolve-add-head">
          <div>
            <span className="eyebrow">ADD TO QUEUE</span>
            <h2>加一道题</h2>
          </div>
          <small>支持任意题目链接；常见平台自动识别，CF / AtCoder / 洛谷会补全题目信息</small>
        </div>
        <form
          className="upsolve-form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label className="upsolve-url-field">
            <span>题目链接</span>
            <div>
              <ExternalLink size={13} />
              <input
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="粘贴题目链接，任意平台都可以"
                spellCheck={false}
                disabled={adding}
              />
            </div>
          </label>
          <label>
            <span>题目名</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="留空尝试自动识别"
              disabled={adding}
            />
          </label>
          <label>
            <span>标签</span>
            <div className="upsolve-tags-input">
              <Tags size={12} />
              <input
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="DP, 二分, 图论"
                disabled={adding}
              />
            </div>
          </label>
          <label>
            <span>难度</span>
            <input
              value={form.difficulty}
              onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
              placeholder="可选，如 1600"
              inputMode="numeric"
              disabled={adding}
            />
          </label>
          <label>
            <span>优先级</span>
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
              disabled={adding}
            >
              <option value={0}>高 · 尽快补</option>
              <option value={1}>中 · 本周内</option>
              <option value={2}>低 · 有空再说</option>
            </select>
          </label>
          <label className="upsolve-note-field">
            <span>备注</span>
            <input
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="卡在哪里、看了什么题解，可选"
              disabled={adding}
            />
          </label>
          <button type="submit" className="upsolve-add-btn" disabled={adding}>
            {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {adding ? '添加中' : '加入队列'}
          </button>
        </form>
      </section>

      <section className="upsolve-contest-panel">
        <div className="upsolve-contest-head">
          <div>
            <span className="eyebrow">CONTEST QUEUES</span>
            <h2>比赛补题队列</h2>
          </div>
          <button type="button" className="upsolve-contest-toggle" onClick={() => void openContestImport()}>
            {contestOpen ? <X size={13} /> : <Plus size={13} />}
            {contestOpen ? '收起' : '按比赛导入'}
          </button>
        </div>
        <div className="upsolve-contest-groups">
          <button
            type="button"
            className={`upsolve-contest-chip ${contestFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setContestFilter('all')}
          >
            全部比赛
            <em>{items.filter((item) => item.contestKey).length}</em>
          </button>
          {(board?.contests ?? []).map((contest) => (
            <button
              key={contest.key}
              type="button"
              className={`upsolve-contest-chip ${contestFilter === contest.key ? 'is-active' : ''}`}
              onClick={() => setContestFilter(contest.key)}
            >
              {contest.name}
              <em>{contest.done}/{contest.total}</em>
            </button>
          ))}
          {!board?.contests?.length ? (
            <span className="upsolve-contest-hint">还没有按比赛导入的题目</span>
          ) : null}
        </div>

        {contestOpen ? (
          <div className="upsolve-contest-import">
            <label className="upsolve-contest-record">
              <span>从我的比赛记录选择</span>
              <select defaultValue="" onChange={(event) => selectContestRecord(event.target.value)}>
                <option value="">手动输入比赛 ID</option>
                {contestRecords.map((record) => (
                  <option
                    key={`${record.platform}-${record.contestId}`}
                    value={`${record.platform === 'atcoder' ? 'at' : 'cf'}:${record.contestId}`}
                  >
                    {record.name} · {new Date(record.startAt).toLocaleDateString('zh-CN')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>平台</span>
              <select
                value={contestPlatform}
                onChange={(event) => setContestPlatform(event.target.value as Platform)}
              >
                <option value="codeforces">Codeforces</option>
                <option value="atcoder">AtCoder</option>
                <option value="luogu">洛谷</option>
              </select>
            </label>
            <label>
              <span>比赛 ID</span>
              <input
                value={contestId}
                onChange={(event) => setContestId(event.target.value)}
                placeholder="1131 / abc482 / 12345"
                spellCheck={false}
              />
            </label>
            <label>
              <span>比赛名（可选）</span>
              <input
                value={contestName}
                onChange={(event) => setContestName(event.target.value)}
                placeholder="留空自动匹配"
              />
            </label>
            <label className="upsolve-contest-only">
              <input
                type="checkbox"
                checked={onlyUnsolved}
                onChange={(event) => setOnlyUnsolved(event.target.checked)}
              />
              只加未通过的题
            </label>
            <button
              type="button"
              className="upsolve-contest-import-btn"
              onClick={() => void importContestQueue()}
              disabled={importingContest}
            >
              {importingContest ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
              {importingContest ? '导入中' : '加入比赛队列'}
            </button>
          </div>
        ) : null}
      </section>

      <div className="upsolve-toolbar">
        <div className="upsolve-status-tabs">
          {(
            [
              { key: 'todo', label: '待补', count: statusCounts?.todo ?? 0 },
              { key: 'doing', label: '进行中', count: statusCounts?.doing ?? 0 },
              { key: 'done', label: '已补完', count: statusCounts?.done ?? 0 },
              { key: 'all', label: '全部', count: statusCounts?.total ?? 0 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={statusFilter === tab.key ? 'is-active' : ''}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
              <em>{tab.count}</em>
            </button>
          ))}
        </div>
        <div className="upsolve-filters">
          <label className="upsolve-search">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索题目、标签…"
            />
          </label>
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value as UpsolvePlatform | 'all')}
          >
            <option value="all">全部平台</option>
            <option value="codeforces">Codeforces</option>
            <option value="atcoder">AtCoder</option>
            <option value="luogu">洛谷</option>
            <option value="nowcoder">牛客</option>
            <option value="codechef">CodeChef</option>
            <option value="acwing">AcWing</option>
            <option value="vjudge">VJudge</option>
            <option value="other">其他平台</option>
          </select>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部标签</option>
            {(board?.tags ?? []).map((tag) => (
              <option key={tag.tag} value={tag.tag}>
                {tag.tag} ({tag.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="upsolve-loading"><Loader2 size={18} className="spin" /> 正在读取补题队列…</div>
      ) : filtered.length ? (
        <div className="upsolve-list">
          {filtered.map((item) => {
            const platform = PLATFORM_META[item.platform];
            const status = STATUS_META[item.status];
            const StatusIcon = status.icon;
            const priority = PRIORITY_META[item.priority] ?? PRIORITY_META[1];
            return (
              <article
                key={item.id}
                className={`upsolve-card status-${item.status}`}
                style={{ '--priority-color': priority.color } as CSSProperties}
              >
                <div className="upsolve-card-priority">
                  <span>{priority.label}</span>
                  <i />
                </div>
                <div className="upsolve-card-body">
                  <div className="upsolve-card-top">
                    <span
                      className="upsolve-platform"
                      style={{ color: platform.color, borderColor: `${platform.color}44` }}
                    >
                      {platform.short} · {platform.label}
                    </span>
                    {item.contestName ? (
                      <button
                        type="button"
                        className="upsolve-contest-name"
                        onClick={() => item.contestKey && setContestFilter(item.contestKey)}
                      >
                        {item.contestName}
                      </button>
                    ) : null}
                    {item.difficulty !== null ? (
                      <span className="upsolve-difficulty">{item.difficulty}</span>
                    ) : null}
                    <span className={`upsolve-status status-${item.status}`}>
                      <StatusIcon size={11} /> {status.label}
                    </span>
                    <span className="upsolve-added">
                      {relativeTime(item.createdAt)}加入
                    </span>
                  </div>

                  {editing?.id === item.id ? (
                    <div className="upsolve-edit">
                      <label>
                        <span>题目名</span>
                        <input
                          value={editForm.title}
                          onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                        />
                      </label>
                      <div className="upsolve-edit-row">
                        <label>
                          <span>标签</span>
                          <input
                            value={editForm.tags}
                            onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })}
                            placeholder="DP, 二分, 图论"
                          />
                        </label>
                        <label>
                          <span>难度</span>
                          <input
                            value={editForm.difficulty}
                            onChange={(event) => setEditForm({ ...editForm, difficulty: event.target.value })}
                            placeholder="可选"
                          />
                        </label>
                        <label>
                          <span>优先级</span>
                          <select
                            value={editForm.priority}
                            onChange={(event) =>
                              setEditForm({ ...editForm, priority: Number(event.target.value) })
                            }
                          >
                            <option value={0}>高</option>
                            <option value={1}>中</option>
                            <option value={2}>低</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>备注</span>
                        <textarea
                          value={editForm.note}
                          onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                          rows={2}
                        />
                      </label>
                      <div className="upsolve-edit-actions">
                        <button type="button" onClick={() => setEditing(null)}>取消</button>
                        <button type="button" className="is-primary" onClick={() => void saveEdit()} disabled={savingEdit}>
                          {savingEdit ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <a href={item.url} target="_blank" rel="noreferrer" className="upsolve-title">
                        {item.title}
                        <ArrowUpRight size={13} />
                      </a>
                      <div className="upsolve-meta-row">
                        {item.tags.length ? (
                          item.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className="upsolve-tag"
                              onClick={() => setTagFilter(tag)}
                            >
                              #{tag}
                            </button>
                          ))
                        ) : (
                          <span className="upsolve-no-tag">没有标签</span>
                        )}
                      </div>
                      {item.note ? <p className="upsolve-note">{item.note}</p> : null}
                    </>
                  )}
                </div>
                <div className="upsolve-actions">
                  {item.status === 'todo' ? (
                    <button type="button" onClick={() => void setStatus(item, 'doing')} disabled={busyId === item.id}>
                      {busyId === item.id ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                      开始
                    </button>
                  ) : null}
                  {item.status !== 'done' ? (
                    <button type="button" className="is-done" onClick={() => void setStatus(item, 'done')} disabled={busyId === item.id}>
                      <Check size={13} /> 补完
                    </button>
                  ) : (
                    <button type="button" onClick={() => void setStatus(item, 'todo')} disabled={busyId === item.id}>
                      <RotateCcw size={13} /> 重开
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(item)}>
                    <Pencil size={13} /> 编辑
                  </button>
                  <button type="button" className="is-danger" onClick={() => void remove(item)} disabled={busyId === item.id}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="upsolve-empty">
          <Inbox size={32} />
          <h2>{statusFilter === 'all' ? '队列还是空的' : '这一栏是空的'}</h2>
          <p>
            {statusFilter === 'todo'
              ? '把比赛里没做出来的题贴到上面，先排进队列。'
              : '切换筛选看看，或者去加一道新题。'}
          </p>
          {statusFilter !== 'todo' ? (
            <button type="button" onClick={() => setStatusFilter('todo')}>看待补队列</button>
          ) : null}
        </div>
      )}

      <footer className="page-footer">
        <span>AlgoPilot v1.3 · 补题队列</span>
        <span className="footer-sep" />
        <span>贴链接自动识别平台 · 本地保存</span>
        <span className="footer-spacer" />
        <span>{board ? `${board.stats.total} 道题在队列里` : '读取中'}</span>
      </footer>
    </div>
  );
}
