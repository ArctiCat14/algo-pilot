import { Boxes, Code2, Sigma, TerminalSquare } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Meta, Platform } from '../types';
import { PLATFORM_INFO } from '../types';
import { formatNumber, relativeTime } from '../format';

interface StatsCardsProps {
  meta: Meta | null;
  activePlatform: Platform | 'all';
  onSelectPlatform: (platform: Platform | 'all') => void;
}

const platformIcons = {
  codeforces: Code2,
  atcoder: TerminalSquare,
  luogu: Boxes,
};

export function StatsCards({ meta, activePlatform, onSelectPlatform }: StatsCardsProps) {
  const total = meta?.total ?? 0;
  const counts = new Map(meta?.platforms.map((item) => [item.platform, item]) ?? []);

  return (
    <section className="stats-grid" aria-label="题库概况">
      <button
        type="button"
        className={`stat-card stat-total ${activePlatform === 'all' ? 'is-selected' : ''}`}
        onClick={() => onSelectPlatform('all')}
      >
        <div className="stat-top">
          <span className="stat-icon">
            <Sigma size={19} />
          </span>
          <span className="stat-kicker">ALL PLATFORMS</span>
          <span className="stat-live">
            <i /> 已同步
          </span>
        </div>
        <div className="stat-value">{meta ? formatNumber(total) : '—'}</div>
        <div className="stat-bottom">
          <span>三平台去重题库</span>
          <span>{relativeTime(meta?.lastSync)}</span>
        </div>
        <div className="stat-orbit" aria-hidden="true" />
      </button>

      {(['codeforces', 'atcoder', 'luogu'] as Platform[]).map((platform) => {
        const info = PLATFORM_INFO[platform];
        const row = counts.get(platform);
        const Icon = platformIcons[platform];
        const share = total > 0 && row ? (row.count / total) * 100 : 0;
        return (
          <button
            key={platform}
            type="button"
            className={`stat-card stat-platform ${activePlatform === platform ? 'is-selected' : ''}`}
            style={{ '--platform-color': info.color } as CSSProperties}
            onClick={() => onSelectPlatform(activePlatform === platform ? 'all' : platform)}
          >
            <div className="stat-top">
              <span className="stat-icon">
                <Icon size={18} />
              </span>
              <span className="stat-kicker">{info.label.toUpperCase()}</span>
              <span className="platform-chip">{info.short}</span>
            </div>
            <div className="stat-value">{row ? formatNumber(row.count) : '0'}</div>
            <div className="share-track">
              <span style={{ width: `${Math.max(share, row?.count ? 2 : 0)}%` }} />
            </div>
            <div className="stat-bottom">
              <span>占题库 {share.toFixed(1)}%</span>
              <span>{relativeTime(row?.lastSync)}</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
