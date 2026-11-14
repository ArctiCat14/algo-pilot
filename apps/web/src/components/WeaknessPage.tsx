import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Crosshair,
  Flame,
  Lightbulb,
  Loader2,
  Radar,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api';
import type { WeaknessReport, WeaknessTag } from '../types';
import { formatNumber, relativeTime } from '../format';

const TAG_LABELS: Record<string, string> = {
  dp: '动态规划',
  greedy: '贪心',
  math: '数学',
  implementation: '实现',
  graphs: '图论',
  'data structures': '数据结构',
  'constructive algorithms': '构造',
  'brute force': '暴力',
  strings: '字符串',
  'binary search': '二分',
  trees: '树',
  sortings: '排序',
  'number theory': '数论',
  geometry: '几何',
  bitmasks: '位运算',
  'two pointers': '双指针',
  'dfs and similar': '搜索',
  combinatorics: '组合数学',
  'shortest paths': '最短路',
  dsu: '并查集',
  'divide and conquer': '分治',
  hashing: '哈希',
  interactive: '交互',
  probabilities: '概率',
  games: '博弈',
  flows: '网络流',
  matrices: '矩阵',
  'string suffix structures': '后缀结构',
  'ternary search': '三分',
  'meet-in-the-middle': '折半搜索',
  'graph matchings': '图匹配',
};

const TAG_SHORT: Record<string, string> = {
  dp: 'DP',
  greedy: '贪心',
  math: '数学',
  implementation: '实现',
  graphs: '图论',
  'data structures': '数据结构',
  'constructive algorithms': '构造',
  'brute force': '暴力',
  strings: '字符串',
  'binary search': '二分',
  trees: '树',
  sortings: '排序',
  'number theory': '数论',
  geometry: '几何',
  bitmasks: '位运算',
  'two pointers': '双指针',
  'dfs and similar': '搜索',
  combinatorics: '组合',
  'shortest paths': '最短路',
  dsu: '并查集',
};

function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

function tagShort(tag: string): string {
  return TAG_SHORT[tag] ?? tagLabel(tag).slice(0, 5);
}

function weaknessTone(score: number): string {
  if (score >= 80) return 'is-high';
  if (score >= 60) return 'is-mid';
  return 'is-low';
}

function confidenceLabel(confidence: WeaknessTag['confidence']): string {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信';
  return '样本少';
}

function WeaknessRadar({ tags }: { tags: WeaknessTag[] }) {
  if (tags.length < 3) {
    return (
      <div className="radar-empty">
        <Radar size={26} />
        <span>至少需要 3 个不同标签才能生成能力雷达。</span>
      </div>
    );
  }

  const width = 360;
  const height = 330;
  const cx = width / 2;
  const cy = height / 2 - 4;
  const radius = 112;
  const count = tags.length;
  const angle = (index: number) => -Math.PI / 2 + (index * Math.PI * 2) / count;
  const point = (value: number, index: number) => {
    const length = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [cx + Math.cos(angle(index)) * length, cy + Math.sin(angle(index)) * length] as const;
  };
  const polygon = (value: number) =>
    tags
      .map((_, index) => point(value, index).join(','))
      .join(' ');

  return (
    <div className="radar-wrap">
      <svg className="radar-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标签能力雷达">
        {[25, 50, 75, 100].map((level) => (
          <polygon
            key={level}
            points={polygon(level)}
            className="radar-grid"
          />
        ))}
        {tags.map((tag, index) => {
          const [x, y] = point(100, index);
          return (
            <line
              key={tag.tag}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              className="radar-axis"
            />
          );
        })}
        <polygon
          points={tags.map((tag, index) => point(tag.mastery, index).join(',')).join(' ')}
          className="radar-data"
        />
        {tags.map((tag, index) => {
          const [x, y] = point(tag.mastery, index);
          return <circle key={tag.tag} cx={x} cy={y} r={3.2} className="radar-dot" />;
        })}
        {tags.map((tag, index) => {
          const [x, y] = point(126, index);
          const cosine = Math.cos(angle(index));
          const anchor = Math.abs(cosine) < 0.2 ? 'middle' : cosine > 0 ? 'start' : 'end';
          return (
            <g key={tag.tag}>
              <text x={x} y={y - 2} textAnchor={anchor} className="radar-label">
                {tagShort(tag.tag)}
              </text>
              <text x={x} y={y + 10} textAnchor={anchor} className="radar-value">
                {tag.mastery}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="radar-legend">
        <span><i className="radar-legend-dot" /> 掌握度 0–100</span>
        <span>越靠近中心越薄弱</span>
      </div>
    </div>
  );
}

function WeaknessCard({
  tag,
  index,
  onPractice,
}: {
  tag: WeaknessTag;
  index: number;
  onPractice: (tag: string) => void;
}) {
  return (
    <article className={`weakness-item ${weaknessTone(tag.weakness)}`}>
      <div className="weakness-rank">0{index + 1}</div>
      <div className="weakness-main">
        <div className="weakness-title-row">
          <div>
            <strong>{tagLabel(tag.tag)}</strong>
            <span>{tag.tag}</span>
          </div>
          <div className="weakness-score">
            <b>{tag.weakness}</b>
            <span>训练优先级</span>
          </div>
        </div>

        <div className="weakness-bar">
          <i style={{ width: `${Math.max(4, tag.weakness)}%` }} />
        </div>

        <div className="weakness-metrics">
          <span><b>{Math.round(tag.solveRate * 100)}%</b> 题目通过率</span>
          <span><b>{tag.attemptsPerSolved.toFixed(1)}</b> 提交 / 过题</span>
          <span><b>{tag.avgDifficulty === null ? '—' : Math.round(tag.avgDifficulty)}</b> 平均难度</span>
          <span><b>{tag.daysSince === null ? '—' : tag.daysSince === 0 ? '今天' : `${tag.daysSince} 天`}</b> 最近练习</span>
        </div>

        <div className="weakness-reasons">
          {tag.reasons.slice(0, 2).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>

        <div className="weakness-foot">
          <span className={`confidence confidence-${tag.confidence}`}>
            {confidenceLabel(tag.confidence)} · {tag.attempts} 次提交 / {tag.attemptedProblems} 题
          </span>
          <button type="button" onClick={() => onPractice(tag.tag)}>
            去练这个标签 <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

interface WeaknessPageProps {
  onNavigate: (view: 'accounts' | 'problems') => void;
  onPracticeTag: (tag: string) => void;
}

export function WeaknessPage({ onNavigate, onPracticeTag }: WeaknessPageProps) {
  const [report, setReport] = useState<WeaknessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.weakness());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '薄弱点分析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const top = report?.weaknesses[0];
  const maxDifficultyAttempts = Math.max(1, ...(report?.difficulty.map((bucket) => bucket.attempts) ?? [1]));

  return (
    <div className="page weakness-page">
      <section className="weakness-hero">
        <div className="weakness-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            WEAKNESS RADAR
            <span className="eyebrow-divider" />
            <span>薄弱点</span>
          </div>
          <h1>
            找到短板，
            <br />
            <span>再针对性地练。</span>
          </h1>
          <p>
            不按感觉选题。用提交记录找出通过率低、反复卡住、
            <br className="desktop-only" />
            以及很久没练的标签。
          </p>
        </div>
        <div className="weakness-hero-actions">
          <div className="weakness-hero-meta">
            <span>分析样本</span>
            <strong>{report ? `${formatNumber(report.totalSubmissions)} 条提交` : '读取中'}</strong>
            <small>{report ? `最近提交 ${relativeTime(report.lastSubmissionAt)}` : '本地计算'}</small>
          </div>
          <button type="button" className="weakness-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            刷新分析
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

      {loading && !report ? (
        <div className="weakness-loading">
          <Loader2 size={22} className="spin" />
          正在分析提交记录…
        </div>
      ) : null}

      {!loading && report && !report.hasData ? (
        <section className="weakness-empty">
          <div className="weakness-empty-icon"><Crosshair size={32} /></div>
          <span className="eyebrow">NO TRAINING SIGNAL YET</span>
          <h2>还没有足够的提交数据</h2>
          <p>先连接 Codeforces、AtCoder 或洛谷账号，系统才能计算标签通过率和卡点。</p>
          <button type="button" className="primary-sync" onClick={() => onNavigate('accounts')}>
            去绑定账号 <ArrowRight size={15} />
          </button>
        </section>
      ) : null}

      {report?.hasData ? (
        <>
          <section className="weakness-stats">
            <div className={`weakness-stat ${top ? weaknessTone(top.weakness) : ''}`}>
              <span className="weakness-stat-icon"><Crosshair size={17} /></span>
              <div>
                <span>最弱标签</span>
                <strong>{top ? tagLabel(top.tag) : '暂无'}</strong>
                <small>{top ? `训练优先级 ${top.weakness} / 100` : '样本不足'}</small>
              </div>
            </div>
            <div className="weakness-stat">
              <span className="weakness-stat-icon"><Target size={17} /></span>
              <div>
                <span>提交通过率</span>
                <strong>{Math.round(report.overallSolveRate * 100)}%</strong>
                <small>{formatNumber(report.totalSolved)} 道 AC / {formatNumber(report.totalSubmissions)} 次提交</small>
              </div>
            </div>
            <div className="weakness-stat">
              <span className="weakness-stat-icon"><Flame size={17} /></span>
              <div>
                <span>平均 AC 成本</span>
                <strong>{report.overallAttemptsPerSolved.toFixed(1)}</strong>
                <small>次提交 / 道过题</small>
              </div>
            </div>
            <div className="weakness-stat">
              <span className="weakness-stat-icon"><BarChart3 size={17} /></span>
              <div>
                <span>标签覆盖</span>
                <strong>{Math.round(report.tagCoverage * 100)}%</strong>
                <small>{report.taggedSubmissions} 条带标签提交</small>
              </div>
            </div>
          </section>

          <div className="weakness-grid">
            <section className="weakness-panel weakness-list-panel">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">PRIORITY QUEUE</span>
                  <h2>薄弱点排行</h2>
                </div>
                <span className="panel-meta">按薄弱指数排序</span>
              </div>
              <div className="weakness-list">
                {report.weaknesses.length ? (
                  report.weaknesses.map((tag, index) => (
                    <WeaknessCard
                      key={tag.tag}
                      tag={tag}
                      index={index}
                      onPractice={onPracticeTag}
                    />
                  ))
                ) : (
                  <div className="weakness-list-empty">
                    <Check size={20} />
                    <span>暂时没有明显的薄弱标签。继续积累带标签的提交后再来看。</span>
                  </div>
                )}
              </div>
            </section>

            <section className="weakness-panel radar-panel">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">MASTERY MAP</span>
                  <h2>能力雷达</h2>
                </div>
                <Radar size={16} className="head-icon" />
              </div>
              <WeaknessRadar tags={report.radar} />
              <div className="strength-block">
                <div className="strength-head">
                  <TrendingUp size={13} />
                  <span>当前优势</span>
                </div>
                <div className="strength-tags">
                  {report.strengths.slice(0, 4).map((tag) => (
                    <span key={tag.tag} className="strength-tag">
                      {tagLabel(tag.tag)} <b>{tag.mastery}</b>
                    </span>
                  ))}
                  {!report.strengths.length ? <span className="tag-empty">暂无</span> : null}
                </div>
              </div>
              <div className="radar-breakdown">
                <p className="mini-label">掌握度明细</p>
                {report.radar.map((tag) => (
                  <div className="radar-row" key={tag.tag}>
                    <span title={tag.tag}>{tagLabel(tag.tag)}</span>
                    <div className="radar-row-track">
                      <i style={{ width: `${tag.mastery}%` }} />
                    </div>
                    <b>{tag.mastery}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="weakness-grid weakness-lower">
            <section className="weakness-panel difficulty-panel">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">DIFFICULTY PROFILE</span>
                  <h2>难度舒适区</h2>
                </div>
                <span className="panel-meta">
                  {report.comfortCeiling ? `舒适上限 ${report.comfortCeiling}` : '样本不足'}
                </span>
              </div>
              <div className="difficulty-rows">
                {report.difficulty.map((bucket) => (
                  <div className="difficulty-row" key={bucket.label}>
                    <span className="difficulty-bucket">{bucket.label}</span>
                    <div className="difficulty-bar-track">
                      <i
                        style={{
                          width: `${Math.max(2, (bucket.attempts / maxDifficultyAttempts) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="difficulty-rate">{Math.round(bucket.solveRate * 100)}%</span>
                    <span className="difficulty-attempts">{bucket.attempts} 次</span>
                  </div>
                ))}
              </div>
              <div className="difficulty-note">
                <span>柱长 = 提交量</span>
                <span>百分比 = 该难度题目通过率</span>
              </div>
            </section>

            <section className="weakness-panel suggestion-panel">
              <div className="account-panel-head">
                <div>
                  <span className="eyebrow">NEXT ACTION</span>
                  <h2>训练建议</h2>
                </div>
                <Lightbulb size={16} className="head-icon" />
              </div>
              <div className="suggestion-list">
                {report.suggestions.map((suggestion, index) => (
                  <button
                    type="button"
                    key={suggestion.tag}
                    className="suggestion-card"
                    onClick={() => onPracticeTag(suggestion.tag)}
                  >
                    <span className="suggestion-number">0{index + 1}</span>
                    <span className="suggestion-copy">
                      <strong>补强 {tagLabel(suggestion.tag)}</strong>
                      <small>{suggestion.reason || '从该标签的低难度题开始补强。'}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
                {!report.suggestions.length ? (
                  <div className="weakness-list-empty">
                    <Check size={20} />
                    <span>暂无需要特别补强的标签。</span>
                  </div>
                ) : null}
              </div>

              <div className="untouched-block">
                <div className="strength-head">
                  <Sparkles size={13} />
                  <span>还没碰过的高频标签</span>
                </div>
                <div className="untouched-tags">
                  {report.untouched.slice(0, 6).map((tag) => (
                    <button
                      type="button"
                      key={tag.tag}
                      onClick={() => onPracticeTag(tag.tag)}
                      title={`题库中共 ${tag.totalProblems} 道`}
                    >
                      {tagLabel(tag.tag)} <span>{tag.totalProblems}</span>
                    </button>
                  ))}
                  {!report.untouched.length ? <span className="tag-empty">已覆盖常用标签</span> : null}
                </div>
              </div>
            </section>
          </div>

          <p className="weakness-source">
            <AlertTriangle size={12} />
            {report.sourceNote}
          </p>
        </>
      ) : null}

      <footer className="page-footer">
        <span>AlgoPilot v0.3 · 薄弱点分析</span>
        <span className="footer-sep" />
        <span>本地计算 · 不上传提交数据</span>
        <span className="footer-spacer" />
        <span>训练优先级 = 通过率 + AC 成本 + 活跃度</span>
      </footer>
    </div>
  );
}
