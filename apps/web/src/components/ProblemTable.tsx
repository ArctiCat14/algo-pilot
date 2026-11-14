import { ArrowUpRight, SearchX } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ProblemList } from '../types';
import { PLATFORM_INFO } from '../types';
import { difficultyTone, formatNumber, formatPercent } from '../format';

interface ProblemTableProps {
  data: ProblemList | null;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onTagClick: (tag: string) => void;
}

function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | '…'> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push('…');
    result.push(page);
  });
  return result;
}

export function ProblemTable({
  data,
  loading,
  onPageChange,
  onPageSizeChange,
  onTagClick,
}: ProblemTableProps) {
  const items = data?.items ?? [];
  const showSkeleton = loading && items.length === 0;

  return (
    <section className={`table-panel ${loading ? 'is-loading' : ''}`}>
      <div className="table-head">
        <div>
          <span className="eyebrow">PROBLEM INDEX</span>
          <h2>题目索引</h2>
        </div>
        <div className="table-meta">
          <span className="result-count">
            <b>{data ? formatNumber(data.total) : '—'}</b> 道题
          </span>
          <span className="meta-divider" />
          <span>第 {data?.page ?? 1} / {data?.totalPages ?? 1} 页</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="problem-table">
          <thead>
            <tr>
              <th className="col-problem">题目</th>
              <th className="col-difficulty">难度</th>
              <th className="col-tags">标签</th>
              <th className="col-acceptance">通过率</th>
              <th className="col-link" aria-label="打开题目" />
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="skeleton-row">
                    <td>
                      <div className="sk-line sk-title" />
                      <div className="sk-line sk-sub" />
                    </td>
                    <td><div className="sk-line sk-short" /></td>
                    <td><div className="sk-line sk-mid" /></td>
                    <td><div className="sk-line sk-short" /></td>
                    <td />
                  </tr>
                ))
              : items.map((problem) => {
                  const info = PLATFORM_INFO[problem.platform];
                  return (
                    <tr
                      key={problem.problemKey}
                      className="problem-row"
                      onClick={() => window.open(problem.url, '_blank', 'noopener,noreferrer')}
                    >
                      <td className="col-problem">
                        <div className="problem-cell">
                          <span
                            className={`platform-badge platform-${problem.platform}`}
                            style={{ '--platform-color': info.color } as CSSProperties}
                          >
                            {info.short}
                          </span>
                          <div className="problem-copy">
                            <a
                              href={problem.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {problem.title}
                            </a>
                            <span className="problem-subline">
                              <em>
                                {problem.platform === 'atcoder'
                                  ? problem.contestId
                                  : problem.externalId}
                              </em>
                              <i className={`problem-status status-${problem.status}`}>
                                {problem.status === 'solved'
                                  ? '已通过'
                                  : problem.status === 'attempted'
                                    ? '尝试未过'
                                    : '未做'}
                              </i>
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="col-difficulty">
                        <div className="difficulty-cell">
                          <div className="difficulty-line">
                            <b className={difficultyTone(problem.difficulty)}>
                              {problem.difficulty ?? '—'}
                            </b>
                            <span>{problem.difficultyLabel}</span>
                          </div>
                          <div className={`difficulty-track ${difficultyTone(problem.difficulty)}`}>
                            <i
                              style={{
                                width: problem.difficulty
                                  ? `${Math.min(100, Math.max(8, (problem.difficulty / 2800) * 100))}%`
                                  : '0%',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="col-tags">
                        <div className="tag-list">
                          {problem.tags.slice(0, 2).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className="tag-chip"
                              onClick={(event) => {
                                event.stopPropagation();
                                onTagClick(tag);
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                          {problem.tags.length > 2 ? (
                            <span className="tag-more">+{problem.tags.length - 2}</span>
                          ) : null}
                          {problem.tags.length === 0 ? <span className="tag-empty">—</span> : null}
                        </div>
                      </td>

                      <td className="col-acceptance">
                        {problem.acceptance === null ? (
                          <span className="acceptance-empty">未提供</span>
                        ) : (
                          <div className="acceptance-cell">
                            <span>{formatPercent(problem.acceptance)}</span>
                            <div className="acceptance-track">
                              <i style={{ width: `${Math.min(100, problem.acceptance * 100)}%` }} />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="col-link">
                        <a
                          href={problem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="open-link"
                          aria-label={`打开 ${problem.title}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ArrowUpRight size={16} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && items.length === 0 ? (
          <div className="empty-state">
            <SearchX size={30} />
            <h3>没有匹配的题目</h3>
            <p>换一个关键词或放宽难度筛选试试。</p>
          </div>
        ) : null}
      </div>

      <div className="table-foot">
        <label className="page-size">
          每页
          <select
            value={data?.pageSize ?? 20}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[20, 30, 50].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          条
        </label>

        <div className="pagination">
          <button
            type="button"
            disabled={!data || data.page <= 1}
            onClick={() => onPageChange((data?.page ?? 1) - 1)}
            aria-label="上一页"
          >
            上一页
          </button>
          {data
            ? pageNumbers(data.page, data.totalPages).map((page, index) =>
                page === '…' ? (
                  <span key={`ellipsis-${index}`} className="page-ellipsis">…</span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    className={page === data.page ? 'is-current' : ''}
                    onClick={() => onPageChange(page)}
                  >
                    {page}
                  </button>
                ),
              )
            : null}
          <button
            type="button"
            disabled={!data || data.page >= data.totalPages}
            onClick={() => onPageChange((data?.page ?? 1) + 1)}
            aria-label="下一页"
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}
