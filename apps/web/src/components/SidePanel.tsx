import {
  Activity,
  Check,
  CircleAlert,
  Clock3,
  Flame,
  RefreshCw,
  Tags,
} from 'lucide-react';
import type { Meta, SyncStatus } from '../types';
import { PLATFORM_INFO } from '../types';
import { formatNumber, relativeTime } from '../format';

interface SidePanelProps {
  meta: Meta | null;
  sync: SyncStatus | null;
  onSync: () => void;
  onSelectTag: (tag: string) => void;
}

export function SidePanel({ meta, sync, onSync, onSelectTag }: SidePanelProps) {
  const running = sync?.running ?? false;
  const progress = sync?.progress;
  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;
  const maxBucket = Math.max(1, ...(meta?.difficultyBuckets.map((item) => item.count) ?? [1]));

  return (
    <aside className="side-column">
      <section className={`side-card sync-card ${running ? 'is-running' : ''}`}>
        <div className="side-head">
          <div>
            <span className="eyebrow">SYNC CENTER</span>
            <h3>同步中枢</h3>
          </div>
          <button
            type="button"
            className={`icon-sync ${running ? 'is-spinning' : ''}`}
            aria-label="立即同步"
            onClick={onSync}
            disabled={running}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {running ? (
          <div className="sync-live">
            <div className="sync-live-top">
              <span className="pulse-dot" />
              <b>
                {progress ? PLATFORM_INFO[progress.platform].label : '准备中'}
              </b>
              <span>{percent === null ? '连接中' : `${percent}%`}</span>
            </div>
            <div className={`progress-track ${percent === null ? 'is-indeterminate' : ''}`}>
              <i style={percent === null ? undefined : { width: `${percent}%` }} />
            </div>
            <p>{progress?.message ?? '正在启动同步任务…'}</p>
            <div className="sync-counts">
              <span>
                当前 <b>{formatNumber(progress?.current ?? 0)}</b>
              </span>
              <span>
                总量 <b>{progress?.total ? formatNumber(progress.total) : '—'}</b>
              </span>
            </div>
          </div>
        ) : (
          <div className="sync-idle">
            <div className="sync-ok-icon">
              <Check size={20} />
            </div>
            <div>
              <strong>题库处于就绪状态</strong>
              <p>上次同步 {relativeTime(meta?.lastSync)}</p>
            </div>
          </div>
        )}

        <div className="sync-stat-row">
          <div>
            <span>题目总量</span>
            <b>{meta ? formatNumber(meta.total) : '—'}</b>
          </div>
          <div>
            <span>数据库</span>
            <b>{meta ? `${(meta.database.size / 1024 / 1024).toFixed(1)} MB` : '—'}</b>
          </div>
          <div>
            <span>平台</span>
            <b>3</b>
          </div>
        </div>

        <div className="run-list">
          <p className="mini-label">最近同步</p>
          {(meta?.recentRuns ?? []).slice(0, 4).map((run) => (
            <div className="run-row" key={run.id}>
              <span className={`run-dot ${run.status === 'success' ? 'is-ok' : 'is-error'}`}>
                {run.status === 'success' ? <Check size={10} /> : <CircleAlert size={10} />}
              </span>
              <span className="run-platform">{PLATFORM_INFO[run.platform].short}</span>
              <span className="run-message">
                {run.status === 'success'
                  ? `${formatNumber(run.fetched)} 道`
                  : '失败'}
              </span>
              <span className="run-time">
                <Clock3 size={11} />
                {relativeTime(run.finished_at ?? run.started_at)}
              </span>
            </div>
          ))}
          {(meta?.recentRuns ?? []).length === 0 ? (
            <p className="run-empty">还没有同步记录</p>
          ) : null}
        </div>
      </section>

      <section className="side-card">
        <div className="side-head compact">
          <div>
            <span className="eyebrow">DIFFICULTY MAP</span>
            <h3>难度分布</h3>
          </div>
          <Activity size={16} className="head-icon" />
        </div>
        <div className="difficulty-chart">
          {(meta?.difficultyBuckets ?? []).map((bucket) => (
            <div className="bar-column" key={bucket.bucket}>
              <span className="bar-value">{formatNumber(bucket.count)}</span>
              <div className="bar-rail">
                <i style={{ height: `${Math.max(3, (bucket.count / maxBucket) * 100)}%` }} />
              </div>
              <span className="bar-label">{bucket.bucket.replace('–', '–').split('–')[0]}</span>
            </div>
          ))}
        </div>
        <div className="chart-axis">
          <span>0</span>
          <span>难度（rating）</span>
          <span>2400+</span>
        </div>
      </section>

      <section className="side-card">
        <div className="side-head compact">
          <div>
            <span className="eyebrow">TOPIC PULSE</span>
            <h3>高频标签</h3>
          </div>
          <Tags size={16} className="head-icon" />
        </div>
        <div className="tag-cloud">
          {(meta?.tags ?? []).slice(0, 16).map((item, index) => (
            <button
              key={item.tag}
              type="button"
              className={index < 3 ? 'is-hot' : ''}
              onClick={() => onSelectTag(item.tag)}
            >
              {index === 0 ? <Flame size={12} /> : null}
              {item.tag}
              <span>{item.count}</span>
            </button>
          ))}
          {(meta?.tags ?? []).length === 0 ? <p className="run-empty">暂无标签</p> : null}
        </div>
      </section>
    </aside>
  );
}
