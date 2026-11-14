import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock3,
  Copy,
  Flame,
  Loader2,
  RefreshCw,
  RotateCcw,
  Timer,
  Trophy,
} from 'lucide-react';
import { api } from '../api';
import type { Contest, ContestOverview, ContestPlatform } from '../types';
import { formatNumber, relativeTime } from '../format';

const CONTEST_INFO: Record<
  ContestPlatform,
  { label: string; short: string; color: string }
> = {
  codeforces: { label: 'Codeforces', short: 'CF', color: '#ff6b5f' },
  atcoder: { label: 'AtCoder', short: 'AT', color: '#7dd3fc' },
  nowcoder: { label: '牛客', short: 'NC', color: '#5eead4' },
};

const PLATFORMS_UI: ContestPlatform[] = ['codeforces', 'atcoder', 'nowcoder'];

function formatContestDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds >= 86_400) {
    const days = Math.round(seconds / 86_400);
    return `${days} 天`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes}m`;
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function formatDateHeading(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(timestamp);
}

function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function briefDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${date.getHours()}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function briefDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function buildContestBrief(contests: Contest[]): string {
  return contests
    .map((contest) =>
      [
        '今日比赛：',
        `平台：${contest.platform}`,
        `名称：${contest.name}`,
        `链接：${contest.url}`,
        `时间：${briefDateTime(contest.startAt)}`,
        `时长：${briefDuration(contest.durationSeconds)}`,
      ].join('\n'),
    )
    .join('\n\n');
}

function countdown(ms: number): string {
  if (ms <= 0) return '进行中';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

function contestTime(contest: Contest, now: number): string {
  if (contest.phase === 'ongoing') {
    return `剩余 ${countdown(contest.endAt - now)}`;
  }
  if (contest.phase === 'upcoming') {
    return `距开赛 ${countdown(contest.startAt - now)}`;
  }
  return '已结束';
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsDate(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function downloadCalendar(contests: Contest[]): void {
  if (!contests.length) return;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AlgoPilot//Contest Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const contest of contests) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:algopilot-${contest.platform}-${contest.contestId}@local`,
      `DTSTAMP:${icsDate(Date.now())}`,
      `DTSTART:${icsDate(contest.startAt)}`,
      `DTEND:${icsDate(contest.endAt)}`,
      `SUMMARY:${escapeIcs(`[${CONTEST_INFO[contest.platform].short}] ${contest.name}`)}`,
      `DESCRIPTION:${escapeIcs([contest.note, contest.url].filter(Boolean).join(' · '))}`,
      `URL:${contest.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'algopilot-contests.ics';
  anchor.click();
  URL.revokeObjectURL(url);
}

function ContestCard({ contest, now }: { contest: Contest; now: number }) {
  const info = CONTEST_INFO[contest.platform];
  const soon = contest.phase === 'upcoming' && contest.startAt - now <= 86_400_000;
  return (
    <a
      className={`contest-card ${contest.phase === 'ongoing' ? 'is-live' : ''} ${soon ? 'is-soon' : ''}`}
      href={contest.url}
      target="_blank"
      rel="noreferrer"
      style={{ '--contest-color': info.color } as CSSProperties}
    >
      <div className="contest-card-top">
        <span className="contest-platform">
          <i />
          {info.label}
        </span>
        <span className={`contest-phase ${contest.phase}`}>
          {contest.phase === 'ongoing' ? 'LIVE' : soon ? 'SOON' : 'UPCOMING'}
        </span>
      </div>
      <h3>{contest.name}</h3>
      <p>{contest.note || '公开比赛'}</p>
      <div className="contest-card-meta">
        <span><Clock3 size={12} /> {formatClock(contest.startAt)}</span>
        <span><Timer size={12} /> {formatContestDuration(contest.durationSeconds)}</span>
        <span className="contest-countdown">{contestTime(contest, now)}</span>
      </div>
      <ArrowUpRight size={15} className="contest-open-icon" />
    </a>
  );
}

type ContestFilter = ContestPlatform | 'all';

export function ContestsPage() {
  const [data, setData] = useState<ContestOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContestFilter>('all');
  const [now, setNow] = useState(Date.now());
  const [brief, setBrief] = useState('');
  const [briefDirty, setBriefDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const briefRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await api.contests(refresh);
      setData(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '比赛数据加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filteredUpcoming = useMemo(
    () =>
      (data?.upcoming ?? []).filter(
        (contest) => filter === 'all' || contest.platform === filter,
      ),
    [data, filter],
  );
  const filteredOngoing = useMemo(
    () =>
      (data?.ongoing ?? []).filter(
        (contest) => filter === 'all' || contest.platform === filter,
      ),
    [data, filter],
  );
  const filteredRecent = useMemo(
    () =>
      (data?.recent ?? []).filter(
        (contest) => filter === 'all' || contest.platform === filter,
      ),
    [data, filter],
  );

  const todayKey = localDateKey(now);
  const todayContests = useMemo(
    () =>
      [...(data?.ongoing ?? []), ...(data?.upcoming ?? [])]
        .filter((contest) => localDateKey(contest.startAt) === todayKey)
        .sort((a, b) => a.startAt - b.startAt),
    [data, todayKey],
  );

  useEffect(() => {
    if (briefDirty) return;
    setBrief(buildContestBrief(todayContests));
  }, [todayContests, briefDirty]);

  const copyBrief = async () => {
    if (!brief.trim()) return;
    try {
      await navigator.clipboard.writeText(brief);
    } catch {
      const textarea = briefRef.current;
      if (textarea) {
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const resetBrief = () => {
    setBrief(buildContestBrief(todayContests));
    setBriefDirty(false);
    setCopied(false);
  };

  const nextContest = [...filteredOngoing, ...filteredUpcoming].sort(
    (a, b) => a.startAt - b.startAt,
  )[0];

  const groupedUpcoming = useMemo(() => {
    const groups = new Map<string, Contest[]>();
    for (const contest of filteredUpcoming) {
      const key = localDateKey(contest.startAt);
      const items = groups.get(key) ?? [];
      items.push(contest);
      groups.set(key, items);
    }
    return [...groups.entries()];
  }, [filteredUpcoming]);

  const platformCounts = useMemo(() => {
    const counts: Record<ContestFilter, number> = {
      all: filteredUpcoming.length + filteredRecent.length,
      codeforces: 0,
      atcoder: 0,
      nowcoder: 0,
    };
    for (const contest of [...filteredUpcoming, ...filteredRecent]) {
      counts[contest.platform] += 1;
    }
    return counts;
  }, [filteredUpcoming, filteredRecent]);

  const nextPlatform = nextContest ? CONTEST_INFO[nextContest.platform] : null;

  return (
    <div className="page contests-page">
      <section className="contests-hero">
        <div className="contests-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            CONTEST CALENDAR
            <span className="eyebrow-divider" />
            <span>近期比赛</span>
          </div>
          <h1>
            下一场，
            <br />
            <span>不要错过。</span>
          </h1>
          <p>
            Codeforces、AtCoder、牛客近期赛事统一时间线。
            <br className="desktop-only" />
            即将开始、正在进行、赛后回顾，一眼看清。
          </p>
        </div>

        <div className="contests-hero-right">
          {nextContest && nextPlatform ? (
            <a
              className={`next-contest ${nextContest.phase === 'ongoing' ? 'is-live' : ''}`}
              href={nextContest.url}
              target="_blank"
              rel="noreferrer"
              style={{ '--contest-color': nextPlatform.color } as CSSProperties}
            >
              <span className="next-contest-label">
                {nextContest.phase === 'ongoing' ? 'ONGOING NOW' : 'UP NEXT'}
              </span>
              <strong>{nextContest.name}</strong>
              <div className="next-contest-countdown">
                {nextContest.phase === 'ongoing'
                  ? `剩余 ${countdown(nextContest.endAt - now)}`
                  : countdown(nextContest.startAt - now)}
              </div>
              <small>
                {nextPlatform.label} · {formatShortDate(nextContest.startAt)}
                <ArrowRight size={12} />
              </small>
            </a>
          ) : (
            <div className="next-contest is-empty">
              <span className="next-contest-label">UP NEXT</span>
              <strong>近期暂无比赛</strong>
              <small>可以稍后刷新，或切换平台查看。</small>
            </div>
          )}
          <div className="contests-hero-buttons">
            <button
              type="button"
              className="weakness-refresh"
              onClick={() => void load(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? '刷新中' : '刷新赛事'}
            </button>
            <button
              type="button"
              className="calendar-export"
              onClick={() => downloadCalendar([...filteredOngoing, ...filteredUpcoming])}
              disabled={!filteredUpcoming.length && !filteredOngoing.length}
            >
              <CalendarPlus size={14} /> 导出日历
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => void load(false)}>重试</button>
        </div>
      ) : null}

      {data?.errors.length ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>
            部分平台赛事刷新失败：
            {data.errors.map((item) => `${CONTEST_INFO[item.platform].label}（${item.message}）`).join('；')}
          </span>
        </div>
      ) : null}

      <section className="contest-brief-panel">
        <div className="contest-brief-head">
          <div>
            <span className="eyebrow">TODAY'S BRIEF</span>
            <h2>今日比赛文案</h2>
          </div>
          <div className="contest-brief-actions">
            <span className="contest-brief-date">
              {todayContests.length ? `今天 ${todayContests.length} 场` : '今天没有比赛'}
            </span>
            <button type="button" onClick={resetBrief} disabled={!todayContests.length && !brief}>
              <RotateCcw size={13} /> 重置
            </button>
            <button type="button" className="is-primary" onClick={() => void copyBrief()} disabled={!brief.trim()}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>
        <textarea
          ref={briefRef}
          className={`contest-brief-textarea ${todayContests.length ? '' : 'is-empty'}`}
          value={brief}
          onChange={(event) => {
            setBrief(event.target.value);
            setBriefDirty(true);
          }}
          rows={todayContests.length === 0 ? 3 : todayContests.length > 1 ? 10 : 7}
          spellCheck={false}
        />
        <small className="contest-brief-hint">
          {todayContests.length
            ? '自动填入今天的赛程，可以直接修改；多场比赛之间用空行分隔。'
            : '今天没有比赛，文案框为空；有比赛时会自动填入。'}
        </small>
      </section>

      <section className="contest-stats">
        <div className="contest-stat">
          <span className="contest-stat-icon"><CalendarDays size={17} /></span>
          <div>
            <span>即将开始</span>
            <strong>{formatNumber(filteredUpcoming.length)}</strong>
            <small>未来 60 天</small>
          </div>
        </div>
        <div className="contest-stat">
          <span className="contest-stat-icon"><Flame size={17} /></span>
          <div>
            <span>正在进行</span>
            <strong>{formatNumber(filteredOngoing.length)}</strong>
            <small>别错过提交</small>
          </div>
        </div>
        <div className="contest-stat">
          <span className="contest-stat-icon"><Trophy size={17} /></span>
          <div>
            <span>近 30 天赛事</span>
            <strong>{formatNumber(filteredRecent.length)}</strong>
            <small>可补题和复盘</small>
          </div>
        </div>
        <div className="contest-stat">
          <span className="contest-stat-icon"><Check size={17} /></span>
          <div>
            <span>数据更新</span>
            <strong>{data?.syncedAt ? relativeTime(data.syncedAt) : '—'}</strong>
            <small>{data?.stale ? '缓存数据' : '已是最新'}</small>
          </div>
        </div>
      </section>

      <div className="contest-toolbar">
        <div className="platform-tabs" role="tablist" aria-label="按平台筛选比赛">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={filter === 'all' ? 'is-active' : ''}
            onClick={() => setFilter('all')}
          >
            全部 <small>{platformCounts.all}</small>
          </button>
          {PLATFORMS_UI.map((platform) => (
            <button
              key={platform}
              type="button"
              role="tab"
              aria-selected={filter === platform}
              className={filter === platform ? 'is-active' : ''}
              onClick={() => setFilter(platform)}
            >
              <i style={{ background: CONTEST_INFO[platform].color }} />
              {CONTEST_INFO[platform].label}
              <small>{platformCounts[platform]}</small>
            </button>
          ))}
        </div>
        <span className="contest-timezone">
          <Globe2Icon /> 时间按本机时区显示
        </span>
      </div>

      {loading ? (
        <div className="contest-loading">
          <Loader2 size={22} className="spin" />
          正在同步三个平台的赛程…
        </div>
      ) : (
        <>
          <section className="contest-timeline-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">UPCOMING TIMELINE</span>
                <h2>接下来的比赛</h2>
              </div>
              <span className="panel-meta">{filteredUpcoming.length} 场</span>
            </div>

            {groupedUpcoming.length ? (
              <div className="contest-timeline">
                {groupedUpcoming.map(([key, contests]) => (
                  <div className="contest-day" key={key}>
                    <div className="contest-day-label">
                      <strong>{formatDateHeading(contests[0].startAt)}</strong>
                      <span>{contests.length} 场</span>
                    </div>
                    <div className="contest-day-events">
                      {contests.map((contest) => (
                        <ContestCard key={`${contest.platform}-${contest.contestId}`} contest={contest} now={now} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="contest-empty">
                <CalendarDays size={28} />
                <strong>未来一段时间没有比赛</strong>
                <span>切换平台筛选，或稍后刷新赛事数据。</span>
              </div>
            )}
          </section>

          <section className="contest-recent-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">RECENT CONTESTS</span>
                <h2>最近结束</h2>
              </div>
              <span className="panel-meta">近 30 天 · 可补题复盘</span>
            </div>
            <div className="contest-recent-table-wrap">
              <table className="contest-recent-table">
                <thead>
                  <tr>
                    <th>开始时间</th>
                    <th>比赛</th>
                    <th>平台</th>
                    <th>时长</th>
                    <th>备注</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredRecent.map((contest) => {
                    const info = CONTEST_INFO[contest.platform];
                    return (
                      <tr key={`${contest.platform}-${contest.contestId}`}>
                        <td className="contest-recent-time">{formatShortDate(contest.startAt)}</td>
                        <td>
                          <a href={contest.url} target="_blank" rel="noreferrer">
                            {contest.name}
                          </a>
                        </td>
                        <td>
                          <span className={`mini-platform platform-${contest.platform}`}>
                            {info.short}
                          </span>
                        </td>
                        <td className="contest-recent-duration">
                          {formatContestDuration(contest.durationSeconds)}
                        </td>
                        <td className="contest-recent-note">{contest.note || '—'}</td>
                        <td>
                          <a
                            href={contest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="contest-open-link"
                            aria-label={`打开 ${contest.name}`}
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredRecent.length ? (
                <div className="contest-empty compact">
                  <Trophy size={24} />
                  <span>近 30 天没有该平台的赛事记录。</span>
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}

      <footer className="page-footer">
        <span>AlgoPilot v0.4 · 近期比赛</span>
        <span className="footer-sep" />
        <span>数据来自各平台公开赛程 · 10 分钟缓存</span>
        <span className="footer-spacer" />
        <span>倒计时按本机时间实时更新</span>
      </footer>
    </div>
  );
}

function Globe2Icon() {
  return <span className="globe-icon">◎</span>;
}
