import {
  BookOpen,
  CalendarDays,
  Crosshair,
  Database,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
  Target,
  Trophy,
  UserRound,
} from 'lucide-react';
import type { Meta } from '../types';
import { formatBytes, formatNumber } from '../format';

export type AppView =
  | 'dashboard'
  | 'problems'
  | 'accounts'
  | 'weakness'
  | 'contests'
  | 'submissions'
  | 'training'
  | 'settings'
  | 'lists'
  | 'contest-records'
  | 'upsolve';

interface SidebarProps {
  meta: Meta | null;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

const navItems: Array<{
  label: string;
  icon: typeof LayoutDashboard;
  view?: AppView;
  soon?: boolean;
}> = [
  { label: '总览', icon: LayoutDashboard, view: 'dashboard' },
  { label: '题库', icon: BookOpen, view: 'problems' },
  { label: '洛谷题单', icon: ListChecks, view: 'lists' },
  { label: '账号同步', icon: UserRound, view: 'accounts' },
  { label: '薄弱点', icon: Crosshair, view: 'weakness' },
  { label: '近期比赛', icon: CalendarDays, view: 'contests' },
  { label: '比赛记录', icon: Trophy, view: 'contest-records' },
  { label: '补题队列', icon: Inbox, view: 'upsolve' },
  { label: '训练计划', icon: Target, view: 'training' },
  { label: '提交记录', icon: History, view: 'submissions' },
  { label: '设置', icon: Settings, view: 'settings' },
];

export function Sidebar({ meta, activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span>A</span>
          <i />
        </div>
        <div className="brand-copy">
          <strong>AlgoPilot</strong>
          <span>TRAINING OS</span>
        </div>
      </div>

      <div className="workspace-pill">
        <span className="workspace-dot" />
        个人训练舱
        <b>LOCAL</b>
      </div>

      <nav className="side-nav" aria-label="主导航">
        <p className="nav-label">WORKSPACE</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = Boolean(item.view && item.view === activeView);
          return (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${active ? 'is-active' : ''}`}
              disabled={item.soon}
              title={item.soon ? '下个版本开放' : item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => item.view && onNavigate(item.view)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {active && item.view === 'problems' && meta ? (
                <em>{formatNumber(meta.total)}</em>
              ) : null}
              {item.soon ? <i>soon</i> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="db-card">
        <div className="db-card-head">
          <Database size={16} />
          <span>本地数据库</span>
          <b className="db-live">LIVE</b>
        </div>
        <div className="db-metric">
          <strong>{meta ? formatNumber(meta.total) : '—'}</strong>
          <span>道题目已入库</span>
        </div>
        <div className="db-size">
          <span>SQLite · WAL</span>
          <span>{meta ? formatBytes(meta.database.size) : '—'}</span>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="avatar">A</div>
        <div>
          <strong>本地用户</strong>
          <span>算法训练中</span>
        </div>
        <span className="user-status" title="本地模式" />
      </div>
    </aside>
  );
}
