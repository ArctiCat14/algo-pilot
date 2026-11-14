import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Loader2,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { api } from '../api';
import type {
  ContestHistoryRecord,
  ContestHistorySummary,
  Platform,
} from '../types';
import { PLATFORM_INFO } from '../types';
import { formatNumber, relativeTime } from '../format';

const PLATFORMS_UI: Platform[] = ['codeforces', 'atcoder'];

interface RankBand {
  name: string;
  min: number;
  max: number;
  color: string;
}

const CODEFORCES_RANKS: RankBand[] = [
  { name: 'Newbie', min: 0, max: 1199, color: '#9aa0a6' },
  { name: 'Pupil', min: 1200, max: 1399, color: '#78c878' },
  { name: 'Specialist', min: 1400, max: 1599, color: '#5fd7d7' },
  { name: 'Expert', min: 1600, max: 1899, color: '#7aa7ff' },
  { name: 'Candidate Master', min: 1900, max: 2099, color: '#c084fc' },
  { name: 'Master', min: 2100, max: 2299, color: '#ffb35c' },
  { name: 'International Master', min: 2300, max: 2399, color: '#ff9d5c' },
  { name: 'Grandmaster', min: 2400, max: 2599, color: '#ff7a6e' },
  { name: 'International Grandmaster', min: 2600, max: 2999, color: '#ff5c5c' },
  { name: 'Legendary Grandmaster', min: 3000, max: 9999, color: '#ff3b3b' },
];

const ATCODER_RANKS: RankBand[] = [
  { name: 'Gray', min: 0, max: 399, color: '#b0b0b0' },
  { name: 'Brown', min: 400, max: 799, color: '#c58a5a' },
  { name: 'Green', min: 800, max: 1199, color: '#78c878' },
  { name: 'Cyan', min: 1200, max: 1599, color: '#5fd7d7' },
  { name: 'Blue', min: 1600, max: 1999, color: '#6ea8ff' },
  { name: 'Yellow', min: 2000, max: 2399, color: '#e3c34a' },
  { name: 'Orange', min: 2400, max: 2799, color: '#ff9f43' },
  { name: 'Red', min: 2800, max: 9999, color: '#ff5c5c' },
];

function rankFor(rating: number | null, bands: RankBand[]): RankBand | null {
  if (rating === null) return null;
  return bands.find((band) => rating >= band.min && rating <= band.max) ?? bands.at(-1) ?? null;
}

function rankRange(band: RankBand): string {
  return band.max >= 9999 ? `${formatNumber(band.min)}+` : `${formatNumber(band.min)}–${formatNumber(band.max)}`;
}

function RankBands({
  platform,
  rating,
}: {
  platform: Platform;
  rating: number | null;
}) {
  const bands = platform === 'codeforces' ? CODEFORCES_RANKS : ATCODER_RANKS;
  const current = rankFor(rating, bands);
  const info = PLATFORM_INFO[platform];
  return (
    <div className="rank-platform-block" style={{ '--rank-platform': info.color } as CSSProperties}>
      <div className="rank-platform-head">
        <div>
          <span className="eyebrow">{platform === 'codeforces' ? 'CODEFORCES RANKS' : 'ATCODER RANKS'}</span>
          <h3>{info.label} 段位区间</h3>
        </div>
        <div className="rank-current">
          <span>当前</span>
          <strong>{rating ?? '—'}</strong>
          <em style={{ color: current?.color }}>{current?.name ?? '未定级'}</em>
        </div>
      </div>
      <div className={`rank-band-grid ${platform === 'codeforces' ? 'is-cf' : 'is-at'}`}>
        {bands.map((band) => {
          const active = current?.name === band.name;
          return (
            <div
              key={band.name}
              className={`rank-band ${active ? 'is-current' : ''}`}
              style={{ '--rank-color': band.color } as CSSProperties}
            >
              <i />
              <span>{band.name}</span>
              <em>{rankRange(band)}</em>
              {active ? <b>当前</b> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function formatRank(rank: number | null): string {
  if (rank === null) return '—';
  return `#${formatNumber(rank)}`;
}

function formatRatingDelta(delta: number | null): string {
  if (delta === null) return '—';
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function RatingChart({
  platform,
  records,
}: {
  platform: Platform;
  records: ContestHistoryRecord[];
}) {
  const rated = records
    .filter(
      (record) =>
        record.platform === platform &&
        record.rated &&
        record.newRating !== null,
    )
    .sort((a, b) => a.startAt - b.startAt);
  const info = PLATFORM_INFO[platform];
  const bands = platform === 'codeforces' ? CODEFORCES_RANKS : ATCODER_RANKS;
  const latest = rated.at(-1)?.newRating ?? null;
  const currentRank = rankFor(latest, bands);

  if (rated.length < 2) {
    return (
      <div className="rating-chart-block">
        <div className="rating-chart-head">
          <span><i style={{ background: info.color }} /> {info.label}</span>
          <b>{latest ?? '—'}</b>
          <em style={{ color: currentRank?.color }}>{currentRank?.name ?? '未定级'}</em>
        </div>
        <div className="contest-history-chart-empty">
          <BarChart3 size={24} />
          <span>至少需要两场 rated 比赛才能画出 rating 曲线。</span>
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 210;
  const padX = 36;
  const padY = 20;
  const ratings = rated.map((record) => record.newRating ?? 0);
  const domainMin = Math.max(0, Math.floor((Math.min(...ratings) - 100) / 100) * 100);
  const domainMax = Math.max(
    domainMin + 400,
    Math.ceil((Math.max(...ratings) + 100) / 100) * 100,
  );
  const minTime = rated[0].startAt;
  const maxTime = rated[rated.length - 1].startAt;
  const x = (timestamp: number) =>
    padX + ((timestamp - minTime) / Math.max(1, maxTime - minTime)) * (width - padX * 2);
  const y = (value: number) =>
    height - padY - ((value - domainMin) / Math.max(1, domainMax - domainMin)) * (height - padY * 2);
  const points = rated
    .map((record) => `${x(record.startAt)},${y(record.newRating ?? 0)}`)
    .join(' ');

  const visibleBands = bands.filter(
    (band) => band.max >= domainMin && band.min <= domainMax,
  );

  return (
    <div className="rating-chart-block">
      <div className="rating-chart-head">
        <span><i style={{ background: info.color }} /> {info.label}</span>
        <b>{latest ?? '—'}</b>
        <em style={{ color: currentRank?.color }}>{currentRank?.name ?? '未定级'}</em>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${info.label} rating 变化曲线`}>
        {visibleBands.map((band) => {
          const from = Math.max(band.min, domainMin);
          const to = Math.min(band.max, domainMax);
          const top = y(to);
          const bottom = y(from);
          const active = currentRank?.name === band.name;
          return (
            <g key={band.name}>
              <rect
                x={padX}
                y={top}
                width={width - padX * 2}
                height={Math.max(1, bottom - top)}
                fill="#ffffff"
                opacity={active ? 0.035 : 0.012}
              />
              <line
                x1={padX}
                y1={bottom}
                x2={width - padX}
                y2={bottom}
                stroke={band.color}
                strokeOpacity={active ? 0.7 : 0.32}
                strokeWidth={active ? 1.2 : 0.8}
              />
            </g>
          );
        })}
        {[0, 1, 2, 3, 4].map((line) => {
          const value = domainMin + ((domainMax - domainMin) / 4) * line;
          const lineY = y(value);
          return (
            <g key={line}>
              <line x1={padX} y1={lineY} x2={width - padX} y2={lineY} className="rating-grid-line" />
              <text x={4} y={lineY + 3} className="rating-axis-text">{Math.round(value)}</text>
            </g>
          );
        })}
        <polyline points={points} className="rating-line" style={{ stroke: info.color }} />
        {rated.map((record) => (
          <circle
            key={`${record.platform}-${record.contestId}`}
            cx={x(record.startAt)}
            cy={y(record.newRating ?? 0)}
            r={2.6}
            className="rating-dot"
            style={{ fill: info.color }}
          />
        ))}
      </svg>
      <div className="rating-band-legend">
        {visibleBands.map((band) => {
          const active = currentRank?.name === band.name;
          return (
            <span key={band.name} className={active ? 'is-current' : ''}>
              <i style={{ background: band.color }} />
              {band.name}
              <em>{rankRange(band)}</em>
            </span>
          );
        })}
      </div>
      <div className="rating-chart-foot">
        <span>{new Date(minTime).toLocaleDateString('zh-CN')}</span>
        <span>{rated.length} 场 rated</span>
        <span>{new Date(maxTime).toLocaleDateString('zh-CN')}</span>
      </div>
    </div>
  );
}

export function ContestRecordsPage() {
  const [records, setRecords] = useState<ContestHistoryRecord[]>([]);
  const [summary, setSummary] = useState<ContestHistorySummary | null>(null);
  const [filter, setFilter] = useState<Platform | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.contestRecords();
      setRecords(response.items);
      setSummary(response.summary);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '比赛记录加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      records.filter(
        (record) => filter === 'all' || record.platform === filter,
      ),
    [records, filter],
  );
  const filteredSummary = useMemo<ContestHistorySummary | null>(() => {
    if (!summary || filter === 'all') return summary;
    const subset = records.filter((record) => record.platform === filter);
    const rated = subset.filter((record) => record.rated);
    const bestRank = subset.reduce<number | null>(
      (best, record) => (record.rank !== null && (best === null || record.rank < best) ? record.rank : best),
      null,
    );
    const maxRating = rated.reduce<number | null>(
      (best, record) => (record.newRating !== null && (best === null || record.newRating > best) ? record.newRating : best),
      null,
    );
    return {
      ...summary,
      total: subset.length,
      bestRank,
      maxRating,
      totalDelta: rated.reduce((sum, record) => sum + (record.ratingDelta ?? 0), 0),
      firstAt: subset.length ? Math.min(...subset.map((record) => record.startAt)) : null,
      lastAt: subset.length ? Math.max(...subset.map((record) => record.startAt)) : null,
    };
  }, [summary, records, filter]);

  const recent = filtered[0];
  const latestRating = (platform: Platform) =>
    records
      .filter((record) => record.platform === platform && record.newRating !== null)
      .sort((a, b) => b.startAt - a.startAt)[0]?.newRating ?? null;
  const currentRating = latestRating('codeforces');
  const atCoderRating = latestRating('atcoder');
  const currentRank = rankFor(currentRating, CODEFORCES_RANKS)?.name;

  return (
    <div className="page contest-history-page">
      <section className="contest-history-hero">
        <div>
          <div className="hero-eyebrow">
            <span className="live-dot" />
            CONTEST HISTORY
            <span className="eyebrow-divider" />
            <span>我的比赛记录</span>
          </div>
          <h1>
            打过多少场，
            <br />
            <span>都记得。</span>
          </h1>
          <p>
            Codeforces 与 AtCoder 的 rated 比赛记录。
            <br className="desktop-only" />
            排名、rating 变化和 performance，按时间整理。
          </p>
        </div>
        <div className="contest-history-hero-side">
          <div className="contest-history-rating">
            <span>CURRENT CF RATING</span>
            <strong>{currentRating ?? '—'}</strong>
            <small>{currentRank ? `${currentRank} · ${summary ? `共 ${summary.total} 场比赛` : ''}` : '读取中'}</small>
          </div>
          <button type="button" className="weakness-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> 刷新记录
          </button>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>重试</button>
        </div>
      ) : null}

      {!loading && !records.length ? (
        <section className="contest-history-empty">
          <Trophy size={32} />
          <h2>还没有比赛记录</h2>
          <p>去账号同步页重新同步一次 Codeforces / AtCoder 账号，rated 比赛记录会一起拉取。</p>
        </section>
      ) : loading ? (
        <div className="contest-history-loading"><Loader2 size={20} className="spin" /> 正在整理比赛记录…</div>
      ) : (
        <>
          <section className="contest-history-stats">
            <div className="contest-history-stat">
              <span>参赛场次</span>
              <strong>{formatNumber(filteredSummary?.total ?? 0)}</strong>
              <small>{filter === 'all' ? 'CF + AtCoder' : PLATFORM_INFO[filter].label}</small>
            </div>
            <div className="contest-history-stat">
              <span>最佳排名</span>
              <strong>{formatRank(filteredSummary?.bestRank ?? null)}</strong>
              <small>历史最高</small>
            </div>
            <div className="contest-history-stat">
              <span>最高 rating</span>
              <strong>{filteredSummary?.maxRating ?? '—'}</strong>
              <small>赛后 rating</small>
            </div>
            <div className="contest-history-stat">
              <span>最近比赛</span>
              <strong>{filteredSummary?.lastAt ? relativeTime(filteredSummary.lastAt) : '—'}</strong>
              <small>{filtered[0]?.name ?? '还没有记录'}</small>
            </div>
          </section>

          <div className="contest-history-toolbar">
            <div className="platform-tabs">
              <button
                type="button"
                className={filter === 'all' ? 'is-active' : ''}
                onClick={() => setFilter('all')}
              >
                全部
              </button>
              {PLATFORMS_UI.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  className={filter === platform ? 'is-active' : ''}
                  onClick={() => setFilter(platform)}
                >
                  <i style={{ background: PLATFORM_INFO[platform].color }} />
                  {PLATFORM_INFO[platform].label}
                </button>
              ))}
            </div>
            <span className="contest-history-last">
              {filteredSummary?.lastAt ? `最近一场 ${relativeTime(filteredSummary.lastAt)}` : ''}
            </span>
          </div>

          <section className="contest-rank-panel">
            <div className="contest-rank-head">
              <div>
                <span className="eyebrow">RANK BANDS</span>
                <h2>段位区间</h2>
              </div>
              <span className="panel-meta">当前 rating 所在的档位会高亮</span>
            </div>
            <div className={`rank-platforms ${filter === 'all' ? '' : 'is-single'}`}>
              {filter !== 'atcoder' ? (
                <RankBands platform="codeforces" rating={currentRating} />
              ) : null}
              {filter !== 'codeforces' ? (
                <RankBands platform="atcoder" rating={atCoderRating} />
              ) : null}
            </div>
          </section>

          <section className="contest-history-chart-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">RATING JOURNEY</span>
                <h2>Rating 走势</h2>
              </div>
              <span className="panel-meta">背景为段位区间</span>
            </div>
            <div className={`rating-chart-grid ${filter === 'all' ? 'is-split' : ''}`}>
              {filter !== 'atcoder' ? (
                <RatingChart platform="codeforces" records={filtered} />
              ) : null}
              {filter !== 'codeforces' ? (
                <RatingChart platform="atcoder" records={filtered} />
              ) : null}
            </div>
          </section>

          <section className="contest-history-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">CONTEST LOG</span>
                <h2>比赛记录</h2>
              </div>
              <span className="panel-meta">{filtered.length} 场</span>
            </div>
            <div className="contest-history-table-wrap">
              <table className="contest-history-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>比赛</th>
                    <th>平台</th>
                    <th>排名</th>
                    <th>Rating 变化</th>
                    <th>Performance</th>
                    <th>赛后</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => {
                    const info = PLATFORM_INFO[record.platform];
                    const contestUrl =
                      record.platform === 'codeforces'
                        ? `https://codeforces.com/contest/${record.contestId}`
                        : `https://atcoder.jp/contests/${record.contestId}`;
                    return (
                      <tr key={`${record.platform}-${record.contestId}`}>
                        <td className="contest-history-date">
                          {new Date(record.startAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                        <td>
                          <a href={contestUrl} target="_blank" rel="noreferrer" className="contest-history-name">
                            {record.name}
                            {!record.rated ? <span>Unrated</span> : null}
                          </a>
                        </td>
                        <td>
                          <span className={`mini-platform platform-${record.platform}`}>
                            {info.short}
                          </span>
                        </td>
                        <td className="contest-history-rank">{formatRank(record.rank)}</td>
                        <td>
                          <span
                            className={`contest-history-delta ${
                              (record.ratingDelta ?? 0) > 0
                                ? 'is-positive'
                                : (record.ratingDelta ?? 0) < 0
                                  ? 'is-negative'
                                  : ''
                            }`}
                          >
                            {formatRatingDelta(record.ratingDelta)}
                          </span>
                        </td>
                        <td className="contest-history-performance">{record.performance ?? '—'}</td>
                        <td className="contest-history-new-rating">{record.newRating ?? '—'}</td>
                        <td>
                          <a
                            href={contestUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="contest-open-link"
                            aria-label={`打开 ${record.name}`}
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filtered.length ? (
              <div className="contest-history-filter-empty">
                该平台还没有比赛记录。
              </div>
            ) : null}
          </section>
        </>
      )}

      <footer className="page-footer">
        <span>AlgoPilot v1.2 · 比赛记录</span>
        <span className="footer-sep" />
        <span>数据来自账号同步 · 只展示公开 rating 记录</span>
        <span className="footer-spacer" />
        <span>{recent ? `最近 ${recent.name}` : '等待账号同步'}</span>
      </footer>
    </div>
  );
}
