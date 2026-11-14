import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Filter,
  History,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  AccountOverview,
  Platform,
  SubmissionList,
  SubmissionQuery,
} from '../types';
import { PLATFORM_INFO } from '../types';
import { formatDateTime, formatNumber, relativeTime } from '../format';
import { difficultyTone } from '../format';

const PLATFORMS_UI: Platform[] = ['codeforces', 'atcoder', 'luogu'];

const VERDICT_LABELS: Record<string, string> = {
  AC: '通过',
  WA: '答案错误',
  TLE: '超时',
  MLE: '内存超限',
  RE: '运行错误',
  CE: '编译错误',
  PARTIAL: '部分分',
  SKIPPED: '跳过',
  JUDGING: '评测中',
};

function verdictTone(verdict: string): string {
  if (verdict === 'AC') return 'verdict-ac';
  if (verdict === 'WA') return 'verdict-wa';
  if (verdict === 'TLE' || verdict === 'MLE') return 'verdict-warn';
  return 'verdict-other';
}

const initialQuery: SubmissionQuery = { page: 1, pageSize: 25 };

interface SubmissionsPageProps {
  onNavigate: (view: 'accounts') => void;
}

export function SubmissionsPage({ onNavigate }: SubmissionsPageProps) {
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [list, setList] = useState<SubmissionList | null>(null);
  const [query, setQuery] = useState<SubmissionQuery>(initialQuery);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const response = await api.accounts();
      setOverview(response.overview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '账号统计加载失败');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((previous) =>
        previous.q === search ? previous : { ...previous, q: search, page: 1 },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .submissions(query, controller.signal)
      .then((response) => {
        setList(response);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '提交记录加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [response] = await Promise.all([
        api.submissions(query),
        loadOverview(),
      ]);
      setList(response);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const setFilter = (patch: Partial<SubmissionQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch, page: 1 }));
  };

  const clearFilters = () => {
    setSearch('');
    setQuery({ ...initialQuery });
  };

  const acSubmissions = overview?.verdicts.find((item) => item.verdict === 'AC')?.count ?? 0;
  const passRate = overview?.totalSubmissions ? acSubmissions / overview.totalSubmissions : 0;
  const hasFilters = Boolean(query.platform || query.verdict || query.q);
  const lastSubmission = overview?.recent[0]?.submittedAt ?? null;

  if (!overviewLoading && !overview?.accounts.length) {
    return (
      <div className="page submissions-page">
        <section className="submissions-empty">
          <div className="submissions-empty-icon"><History size={32} /></div>
          <span className="eyebrow">NO SUBMISSION HISTORY</span>
          <h2>还没有提交记录</h2>
          <p>先绑定 Codeforces、AtCoder 或洛谷账号，提交记录会自动同步到这里。</p>
          <button type="button" className="primary-sync" onClick={() => onNavigate('accounts')}>
            去绑定账号 <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page submissions-page">
      <section className="submissions-hero">
        <div className="submissions-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            SUBMISSION LOG
            <span className="eyebrow-divider" />
            <span>提交记录</span>
          </div>
          <h1>
            每一次提交，
            <br />
            <span>都算数。</span>
          </h1>
          <p>
            三个平台的提交轨迹汇总在一起。
            <br className="desktop-only" />
            看结果、看语言、看难度，也看自己是怎么一步步做出来的。
          </p>
        </div>
        <div className="submissions-hero-actions">
          <div className="submissions-hero-meta">
            <span>LOCAL HISTORY</span>
            <strong>{overview ? `${formatNumber(overview.totalSubmissions)} 条提交` : '读取中'}</strong>
            <small>{lastSubmission ? `最近提交 ${relativeTime(lastSubmission)}` : '等待账号数据'}</small>
          </div>
          <button type="button" className="weakness-refresh" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? '刷新中' : '刷新记录'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>重试</button>
        </div>
      ) : null}

      <section className="submission-stats">
        <div className="submission-stat">
          <span className="submission-stat-icon"><History size={17} /></span>
          <div>
            <span>总提交</span>
            <strong>{overview ? formatNumber(overview.totalSubmissions) : '—'}</strong>
            <small>三个平台累计</small>
          </div>
        </div>
        <div className="submission-stat">
          <span className="submission-stat-icon"><Check size={17} /></span>
          <div>
            <span>AC 题目</span>
            <strong>{overview ? formatNumber(overview.totalSolved) : '—'}</strong>
            <small>各平台去重</small>
          </div>
        </div>
        <div className="submission-stat">
          <span className="submission-stat-icon"><Filter size={17} /></span>
          <div>
            <span>提交通过率</span>
            <strong>{overview ? `${Math.round(passRate * 100)}%` : '—'}</strong>
            <small>AC 提交 / 总提交</small>
          </div>
        </div>
        <div className="submission-stat">
          <span className="submission-stat-icon"><History size={17} /></span>
          <div>
            <span>活跃天数</span>
            <strong>{overview ? formatNumber(overview.activeDays) : '—'}</strong>
            <small>有提交的日历日</small>
          </div>
        </div>
      </section>

      <section className="submission-filter-panel">
        <div className="submission-filter-main">
          <div className="platform-tabs" role="tablist" aria-label="按平台筛选提交">
            <button
              type="button"
              role="tab"
              aria-selected={!query.platform}
              className={!query.platform ? 'is-active' : ''}
              onClick={() => setFilter({ platform: undefined })}
            >
              全部
            </button>
            {PLATFORMS_UI.map((platform) => (
              <button
                key={platform}
                type="button"
                role="tab"
                aria-selected={query.platform === platform}
                className={query.platform === platform ? 'is-active' : ''}
                onClick={() => setFilter({ platform })}
              >
                <i style={{ background: PLATFORM_INFO[platform].color }} />
                {PLATFORM_INFO[platform].label}
              </button>
            ))}
          </div>

          <label className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索题目名、题号…"
              spellCheck={false}
            />
            {search ? (
              <button type="button" aria-label="清空搜索" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            ) : null}
          </label>
        </div>

        <div className="submission-filter-sub">
          <label className="select-wrap">
            <Filter size={14} />
            <select
              value={query.verdict ?? ''}
              onChange={(event) => setFilter({ verdict: event.target.value || undefined })}
            >
              <option value="">全部结果</option>
              {(overview?.verdicts ?? []).map((item) => (
                <option key={item.verdict} value={item.verdict}>
                  {item.verdict} · {VERDICT_LABELS[item.verdict] ?? item.verdict}（{item.count}）
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="clear-filters" onClick={clearFilters}>
              <X size={13} /> 清除筛选
            </button>
          ) : null}
          <span className="submission-filter-note">洛谷过题记录没有提交时间</span>
        </div>
      </section>

      <section className="submissions-panel">
        <div className="submissions-panel-head">
          <div>
            <span className="eyebrow">SUBMISSION STREAM</span>
            <h2>提交流水</h2>
          </div>
          <span className="submissions-count">
            <b>{list ? formatNumber(list.total) : '—'}</b> 条记录
          </span>
        </div>

        <div className="submissions-table-wrap">
          <table className="submissions-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>题目</th>
                <th>结果</th>
                <th>语言</th>
                <th>Rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={`skeleton-${index}`} className="submission-skeleton-row">
                      <td><div className="sk-line sk-short" /></td>
                      <td><div className="sk-line sk-title" /><div className="sk-line sk-sub" /></td>
                      <td><div className="sk-line sk-short" /></td>
                      <td><div className="sk-line sk-mid" /></td>
                      <td><div className="sk-line sk-short" /></td>
                      <td />
                    </tr>
                  ))
                : (list?.items ?? []).map((submission) => {
                    const info = PLATFORM_INFO[submission.platform];
                    return (
                      <tr
                        className="submission-row"
                        key={`${submission.platform}-${submission.externalId}`}
                        onClick={() => {
                          if (submission.problemUrl) window.open(submission.problemUrl, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        <td className="submission-time">
                          {submission.submittedAt ? (
                            <>
                              <b>{formatDateTime(submission.submittedAt)}</b>
                              <span>本地时间</span>
                            </>
                          ) : (
                            <>
                              <b>—</b>
                              <span>题目导入</span>
                            </>
                          )}
                        </td>
                        <td>
                          <div className="submission-problem">
                            <span
                              className={`platform-badge platform-${submission.platform}`}
                              style={{ '--platform-color': info.color } as CSSProperties}
                            >
                              {info.short}
                            </span>
                            <div className="submission-problem-copy">
                              {submission.problemUrl ? (
                                <a
                                  href={submission.problemUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {submission.problemTitle || submission.problemKey}
                                </a>
                              ) : (
                                <span>{submission.problemTitle || submission.problemKey}</span>
                              )}
                              <small>
                                {submission.problemKey}
                                {submission.tags.slice(0, 2).map((tag) => (
                                  <em key={tag}>{tag}</em>
                                ))}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`verdict-pill ${verdictTone(submission.verdict)}`}
                            title={VERDICT_LABELS[submission.verdict] ?? submission.verdict}
                          >
                            {submission.verdict}
                          </span>
                        </td>
                        <td className="submission-language">
                          {submission.language || '—'}
                        </td>
                        <td>
                          <span className={`submission-rating ${difficultyTone(submission.rating)}`}>
                            {submission.rating ?? '—'}
                          </span>
                        </td>
                        <td>
                          {submission.problemUrl ? (
                            <a
                              className="open-link"
                              href={submission.problemUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="打开题目"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ArrowUpRight size={15} />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && !list?.items.length ? (
            <div className="submission-list-empty">
              <Search size={24} />
              <strong>没有匹配的提交</strong>
              <span>换一个关键词，或清除平台 / 结果筛选。</span>
            </div>
          ) : null}
        </div>

        <div className="submission-foot">
          <label className="page-size">
            每页
            <select
              value={query.pageSize}
              onChange={(event) => setFilter({ pageSize: Number(event.target.value) })}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            条
          </label>
          <div className="pagination">
            <button
              type="button"
              disabled={!list || list.page <= 1}
              onClick={() => setQuery((previous) => ({ ...previous, page: previous.page - 1 }))}
            >
              上一页
            </button>
            <span className="submission-page-info">
              {list?.page ?? 1} / {list?.totalPages ?? 1}
            </span>
            <button
              type="button"
              disabled={!list || list.page >= list.totalPages}
              onClick={() => setQuery((previous) => ({ ...previous, page: previous.page + 1 }))}
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <footer className="page-footer">
        <span>AlgoPilot v0.5 · 提交记录</span>
        <span className="footer-sep" />
        <span>数据保存在本机 · SQLite WAL</span>
        <span className="footer-spacer" />
        <span>共 {list ? formatNumber(list.total) : '—'} 条匹配记录</span>
      </footer>
    </div>
  );
}
