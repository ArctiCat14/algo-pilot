import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  Code2,
  ExternalLink,
  Flame,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Target,
  TerminalSquare,
  Unlink,
  UserRound,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  Account,
  AccountsResponse,
  ActivityDay,
  Platform,
} from '../types';
import { PLATFORM_INFO } from '../types';
import { formatDateTime, formatNumber, relativeTime } from '../format';

const PLATFORMS_UI: Platform[] = ['codeforces', 'atcoder', 'luogu'];

const PLATFORM_COPY: Record<
  Platform,
  { placeholder: string; label: string; hint: string; blurb: string; icon: typeof Code2 }
> = {
  codeforces: {
    placeholder: '例如 tourist',
    label: 'Codeforces handle',
    hint: '支持直接粘贴 profile 链接',
    blurb: '同步 rating、全部提交、标签和过题状态。',
    icon: Code2,
  },
  atcoder: {
    placeholder: '例如 tourist',
    label: 'AtCoder handle',
    hint: 'Kenkoooo 公开数据',
    blurb: '同步 rating 历史、全部提交和过题状态。',
    icon: TerminalSquare,
  },
  luogu: {
    placeholder: '例如 377873',
    label: '洛谷 UID',
    hint: '数字 UID，不是用户名',
    blurb: '同步公开过题列表、难度和标签。',
    icon: Boxes,
  },
};

const VERDICT_LABELS: Record<string, string> = {
  AC: '通过',
  WA: '答案错误',
  TLE: '超时',
  MLE: '内存超限',
  RE: '运行错误',
  CE: '编译错误',
  PE: '格式错误',
  OLE: '输出超限',
  PARTIAL: '部分分',
  SKIPPED: '跳过',
  JUDGING: '评测中',
  UNKNOWN: '未知',
};

function verdictTone(verdict: string): string {
  if (verdict === 'AC') return 'verdict-ac';
  if (verdict === 'WA') return 'verdict-wa';
  if (verdict === 'TLE' || verdict === 'MLE') return 'verdict-warn';
  return 'verdict-other';
}

function AccountAvatar({ account }: { account: Account }) {
  const [broken, setBroken] = useState(false);
  const initial = (account.displayName || account.handle).slice(0, 1).toUpperCase();

  useEffect(() => setBroken(false), [account.avatarUrl]);

  if (account.avatarUrl && !broken) {
    return (
      <img
        className="account-avatar"
        src={account.avatarUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className="account-avatar account-avatar-fallback">{initial}</div>;
}

function ActivityHeatmap({ activity }: { activity: ActivityDay[] }) {
  const max = Math.max(1, ...activity.map((day) => day.count));
  const first = activity[0]?.date;
  const leading = first ? (new Date(`${first}T00:00:00`).getDay() + 6) % 7 : 0;
  const cells: Array<{ date: string; count: number } | null> = [
    ...Array.from({ length: leading }, () => null),
    ...activity,
  ];

  return (
    <div className="heatmap-scroll">
      <div className="heatmap" aria-label="最近 140 天提交活跃度">
        {cells.map((day, index) =>
          day ? (
            <span
              key={day.date}
              className={`heat-cell heat-${day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / max) * 4))}`}
              title={`${day.date} · ${day.count} 次提交`}
            />
          ) : (
            <span key={`blank-${index}`} className="heat-cell heat-blank" />
          ),
        )}
      </div>
      <div className="heat-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i key={level} className={`heat-cell heat-${level}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

type BusyState = Partial<Record<Platform, 'connect' | 'sync'>>;

export function AccountsPage() {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>({});
  const [busyAll, setBusyAll] = useState(false);
  const [handles, setHandles] = useState<Record<Platform, string>>({
    codeforces: '',
    atcoder: '',
    luogu: '',
  });
  const [editing, setEditing] = useState<Partial<Record<Platform, boolean>>>({});

  const load = useCallback(async () => {
    try {
      const next = await api.accounts();
      setData(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '账号数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const accounts = data?.overview.accounts ?? [];
  const overview = data?.overview;
  const byPlatform = new Map(accounts.map((account) => [account.platform, account]));

  const connect = async (platform: Platform, value: string) => {
    const handle = value.trim();
    if (!handle) {
      setError(platform === 'luogu' ? '请填写洛谷数字 UID' : '请填写 handle');
      return;
    }
    setBusy((previous) => ({ ...previous, [platform]: 'connect' }));
    setError(null);
    try {
      const result = await api.connectAccount(platform, handle);
      setHandles((previous) => ({ ...previous, [platform]: '' }));
      setEditing((previous) => ({ ...previous, [platform]: false }));
      await load();
      setToast(`${PLATFORM_INFO[platform].label} 已连接 · 同步 ${formatNumber(result.fetched)} 条`);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : '连接失败');
      setEditing((previous) => ({ ...previous, [platform]: true }));
      await load();
    } finally {
      setBusy((previous) => ({ ...previous, [platform]: undefined }));
    }
  };

  const sync = async (platform: Platform) => {
    setBusy((previous) => ({ ...previous, [platform]: 'sync' }));
    setError(null);
    try {
      const result = await api.syncAccount(platform);
      await load();
      setToast(`${PLATFORM_INFO[platform].label} 同步完成 · ${formatNumber(result.fetched)} 条`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '同步失败');
      await load();
    } finally {
      setBusy((previous) => ({ ...previous, [platform]: undefined }));
    }
  };

  const disconnect = async (platform: Platform) => {
    if (!window.confirm(`确定解除 ${PLATFORM_INFO[platform].label} 账号？本地提交记录会一并删除。`)) {
      return;
    }
    try {
      await api.disconnectAccount(platform);
      await load();
      setToast(`${PLATFORM_INFO[platform].label} 已解除绑定`);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : '解除失败');
    }
  };

  const syncAll = async () => {
    if (!accounts.length) return;
    setBusyAll(true);
    setError(null);
    try {
      const result = await api.syncAllAccounts();
      await load();
      const failed = result.errors.length;
      setToast(
        failed
          ? `同步完成，${failed} 个平台失败`
          : `全部账号同步完成 · ${formatNumber(result.results.reduce((sum, item) => sum + item.fetched, 0))} 条`,
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '同步失败');
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <div className="page accounts-page">
      <section className="accounts-hero">
        <div className="accounts-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            PLAYER SIGNAL
            <span className="eyebrow-divider" />
            <span>账号中枢</span>
          </div>
          <h1>
            连接账号，
            <br />
            <span>让每道题都有回声。</span>
          </h1>
          <p>
            把三个平台的练习记录汇总到本地。
            <br className="desktop-only" />
            rating、过题、提交和活跃度，统一成一份训练档案。
          </p>
        </div>

        <div className="accounts-hero-actions">
          <div className="account-live-stamp">
            <span>LOCAL PROFILE</span>
            <strong>{accounts.length ? `${accounts.length} 个平台已连接` : '等待连接第一个账号'}</strong>
            <small>{overview?.lastSync ? `上次同步 ${relativeTime(overview.lastSync)}` : '数据只保存在本机'}</small>
          </div>
          {accounts.length ? (
            <button
              type="button"
              className={`primary-sync ${busyAll ? 'is-running' : ''}`}
              onClick={() => void syncAll()}
              disabled={busyAll}
            >
              <RefreshCw size={17} />
              {busyAll ? '同步中' : '同步全部账号'}
            </button>
          ) : null}
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
          <Check size={16} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)}>关闭</button>
        </div>
      ) : null}

      <section className="account-stats">
        <div className="account-stat">
          <span className="account-stat-icon"><Target size={17} /></span>
          <div>
            <span>累计过题</span>
            <strong>{overview ? formatNumber(overview.totalSolved) : '—'}</strong>
            <small>各平台 AC 题目累计</small>
          </div>
        </div>
        <div className="account-stat">
          <span className="account-stat-icon"><RefreshCw size={17} /></span>
          <div>
            <span>记录总数</span>
            <strong>{overview ? formatNumber(overview.totalSubmissions) : '—'}</strong>
            <small>提交 + 洛谷公开过题</small>
          </div>
        </div>
        <div className="account-stat">
          <span className="account-stat-icon"><Activity size={17} /></span>
          <div>
            <span>活跃天数</span>
            <strong>{overview ? formatNumber(overview.activeDays) : '—'}</strong>
            <small>有提交的日历日</small>
          </div>
        </div>
        <div className="account-stat">
          <span className="account-stat-icon"><Flame size={17} /></span>
          <div>
            <span>当前连击</span>
            <strong>{overview ? `${overview.streak} 天` : '—'}</strong>
            <small>{overview?.streak ? '继续保持' : '从今天开始'}</small>
          </div>
        </div>
      </section>

      <div className="accounts-section-head">
        <div>
          <span className="eyebrow">CONNECTED PLATFORMS</span>
          <h2>平台账号</h2>
        </div>
        <span className="accounts-section-note">本地保存 · 不需要密码</span>
      </div>

      <section className="account-grid">
        {PLATFORMS_UI.map((platform) => {
          const info = PLATFORM_INFO[platform];
          const copy = PLATFORM_COPY[platform];
          const account = byPlatform.get(platform);
          const isBusy = busy[platform];
          const isEditing = editing[platform];
          const Icon = copy.icon;

          return (
            <article
              key={platform}
              className={`account-card ${account ? 'is-connected' : ''} ${account?.status === 'error' ? 'has-error' : ''}`}
              style={{ '--platform-color': info.color } as CSSProperties}
            >
              <header className="account-card-head">
                <span className="account-platform-icon"><Icon size={17} /></span>
                <div>
                  <h3>{info.label}</h3>
                  <span>
                    {account ? (account.status === 'error' ? '同步异常' : '已连接') : '未连接'}
                  </span>
                </div>
                {account?.profileUrl ? (
                  <a
                    className="account-profile-link"
                    href={account.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`打开 ${info.label} 主页`}
                  >
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </header>

              {account && !isEditing ? (
                <>
                  <div className="account-identity">
                    <AccountAvatar account={account} />
                    <div className="account-identity-copy">
                      <strong>{account.displayName || account.handle}</strong>
                      <span>@{account.handle}</span>
                    </div>
                    <div className="account-rating">
                      <b>{account.rating ?? '—'}</b>
                      <span>{account.rank || 'RATING'}</span>
                    </div>
                  </div>

                  <div className="account-metrics">
                    <div>
                      <span>过题</span>
                      <b>{formatNumber(account.solvedCount)}</b>
                    </div>
                    <div>
                      <span>{platform === 'luogu' ? '收录' : '提交'}</span>
                      <b>{formatNumber(account.submissionCount)}</b>
                    </div>
                    <div>
                      <span>最高 rating</span>
                      <b>{account.maxRating ?? '—'}</b>
                    </div>
                  </div>

                  {account.status === 'error' ? (
                    <p className="account-error">
                      <AlertTriangle size={12} />
                      {account.error || '同步失败'}
                    </p>
                  ) : null}
                  {platform === 'luogu' ? (
                    <p className="account-note">洛谷仅同步公开过题列表，不包含逐题提交时间。</p>
                  ) : null}

                  <div className="account-card-foot">
                    <span>同步于 {relativeTime(account.lastSyncAt)}</span>
                    <button
                      type="button"
                      className="account-action"
                      onClick={() => void sync(platform)}
                      disabled={Boolean(isBusy)}
                    >
                      {isBusy === 'sync' ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                      同步
                    </button>
                    <button
                      type="button"
                      className="account-action"
                      onClick={() => setEditing((previous) => ({ ...previous, [platform]: true }))}
                      disabled={Boolean(isBusy)}
                    >
                      <Pencil size={13} /> 更换
                    </button>
                    <button
                      type="button"
                      className="account-action is-danger"
                      onClick={() => void disconnect(platform)}
                      disabled={Boolean(isBusy)}
                    >
                      <Unlink size={13} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="account-form-intro">
                    <div className="account-form-icon"><UserRound size={22} /></div>
                    <p>{copy.blurb}</p>
                  </div>
                  <form
                    className="account-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void connect(platform, handles[platform]);
                    }}
                  >
                    <label htmlFor={`account-${platform}`}>{copy.label}</label>
                    <div className="account-input-row">
                      <input
                        id={`account-${platform}`}
                        value={handles[platform]}
                        onChange={(event) =>
                          setHandles((previous) => ({ ...previous, [platform]: event.target.value }))
                        }
                        placeholder={copy.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={Boolean(isBusy)}
                      />
                      <button type="submit" disabled={Boolean(isBusy)}>
                        {isBusy === 'connect' ? <Loader2 size={14} className="spin" /> : '连接'}
                      </button>
                    </div>
                  </form>
                  <p className="account-hint">{copy.hint}</p>
                  <p className="account-safety">
                    <ShieldCheck size={12} />
                    仅读取公开数据，不保存密码
                  </p>
                  {account?.status === 'error' ? (
                    <p className="account-error">
                      <AlertTriangle size={12} />
                      {account.error}
                    </p>
                  ) : null}
                  {isEditing ? (
                    <button
                      type="button"
                      className="account-cancel-edit"
                      onClick={() => setEditing((previous) => ({ ...previous, [platform]: false }))}
                    >
                      <X size={12} /> 取消更换
                    </button>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </section>

      <div className="account-lower-grid">
        <section className="account-panel activity-panel">
          <div className="account-panel-head">
            <div>
              <span className="eyebrow">CONSISTENCY</span>
              <h2>训练活跃度</h2>
            </div>
            <span className="panel-meta">最近 20 周 · {overview?.activeDays ?? 0} 个活跃日</span>
          </div>
          {loading ? (
            <div className="account-panel-loading"><Loader2 size={18} className="spin" /> 加载中</div>
          ) : (
            <ActivityHeatmap activity={overview?.activity ?? []} />
          )}
          <div className="activity-foot">
            <span><Flame size={13} /> 连续 {overview?.streak ?? 0} 天</span>
            <span>洛谷记录不提供日期，不计入活跃度</span>
          </div>
        </section>

        <section className="account-panel verdict-panel">
          <div className="account-panel-head">
            <div>
              <span className="eyebrow">VERDICT MIX</span>
              <h2>评测分布</h2>
            </div>
          </div>
          <div className="verdict-list">
            {(overview?.verdicts ?? []).map((item) => {
              const total = overview?.totalSubmissions ?? 1;
              return (
                <div className="verdict-row" key={item.verdict}>
                  <span className={`verdict-label ${verdictTone(item.verdict)}`}>
                    {item.verdict}
                  </span>
                  <div className="verdict-track">
                    <i
                      className={verdictTone(item.verdict)}
                      style={{ width: `${Math.max(2, (item.count / total) * 100)}%` }}
                    />
                  </div>
                  <b>{formatNumber(item.count)}</b>
                </div>
              );
            })}
            {!overview?.verdicts.length ? (
              <p className="account-panel-empty">连接账号后显示评测分布。</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="account-panel recent-panel">
        <div className="account-panel-head">
          <div>
            <span className="eyebrow">LATEST ACTIVITY</span>
            <h2>最近提交</h2>
          </div>
          <span className="panel-meta">最近 14 条</span>
        </div>
        <div className="recent-table-wrap">
          <table className="recent-table">
            <thead>
              <tr>
                <th>题目</th>
                <th>平台</th>
                <th>结果</th>
                <th>语言</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.recent ?? []).map((submission) => (
                <tr key={`${submission.platform}-${submission.externalId}`}>
                  <td>
                    {submission.problemUrl ? (
                      <a href={submission.problemUrl} target="_blank" rel="noreferrer">
                        {submission.problemTitle || submission.problemKey}
                      </a>
                    ) : (
                      <span>{submission.problemTitle || submission.problemKey}</span>
                    )}
                  </td>
                  <td>
                    <span className={`mini-platform platform-${submission.platform}`}>
                      {PLATFORM_INFO[submission.platform].short}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`verdict-pill ${verdictTone(submission.verdict)}`}
                      title={VERDICT_LABELS[submission.verdict] ?? submission.verdict}
                    >
                      {submission.verdict}
                    </span>
                  </td>
                  <td className="recent-language">{submission.language || '—'}</td>
                  <td className="recent-time">
                    {submission.submittedAt ? formatDateTime(submission.submittedAt) : '过题导入'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!overview?.recent.length ? (
            <div className="account-panel-empty recent-empty">
              <Activity size={24} />
              <span>连接账号后，这里会出现你的提交轨迹。</span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="page-footer">
        <span>AlgoPilot v0.2 · 账号档案</span>
        <span className="footer-sep" />
        <span>只读取公开数据 · 不保存密码</span>
        <span className="footer-spacer" />
        <span>{loading ? '正在读取本地数据…' : '数据已同步到本机'}</span>
      </footer>
    </div>
  );
}
