import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Command, RefreshCw, Sparkles } from 'lucide-react';
import { api } from './api';
import { AccountsPage } from './components/AccountsPage';
import { Filters, type DifficultyPreset } from './components/Filters';
import { ProblemTable } from './components/ProblemTable';
import { SidePanel } from './components/SidePanel';
import { Sidebar, type AppView } from './components/Sidebar';
import { StatsCards } from './components/StatsCards';
import { WeaknessPage } from './components/WeaknessPage';
import { ContestsPage } from './components/ContestsPage';
import { SubmissionsPage } from './components/SubmissionsPage';
import { TrainingPage } from './components/TrainingPage';
import { SettingsPage } from './components/SettingsPage';
import { DashboardPage } from './components/DashboardPage';
import { ProblemListsPage } from './components/ProblemListsPage';
import { ContestRecordsPage } from './components/ContestRecordsPage';
import { UpsolvePage } from './components/UpsolvePage';
import type {
  Meta,
  Platform,
  ProblemList,
  ProblemQuery,
  SortOption,
  SyncStatus,
} from './types';
import { PLATFORM_INFO } from './types';
import { formatDuration, relativeTime } from './format';
import { applyAccent } from './theme';

const initialQuery: ProblemQuery = {
  page: 1,
  pageSize: 20,
  sort: 'default',
};

function viewFromHash(): AppView {
  if (window.location.hash === '#problems') return 'problems';
  if (window.location.hash === '#lists') return 'lists';
  if (window.location.hash === '#accounts') return 'accounts';
  if (window.location.hash === '#weakness') return 'weakness';
  if (window.location.hash === '#contests') return 'contests';
  if (window.location.hash === '#contest-records') return 'contest-records';
  if (window.location.hash === '#upsolve') return 'upsolve';
  if (window.location.hash === '#submissions') return 'submissions';
  if (window.location.hash === '#training') return 'training';
  if (window.location.hash === '#settings') return 'settings';
  return 'dashboard';
}

function difficultyRange(preset: DifficultyPreset): { min?: number; max?: number } {
  switch (preset) {
    case '0-999':
      return { min: 0, max: 999 };
    case '1000-1599':
      return { min: 1000, max: 1599 };
    case '1600-2099':
      return { min: 1600, max: 2099 };
    case '2100+':
      return { min: 2100, max: 3000 };
    default:
      return {};
  }
}

function presetFromRange(min?: number, max?: number): DifficultyPreset {
  if (min === 0 && max === 999) return '0-999';
  if (min === 1000 && max === 1599) return '1000-1599';
  if (min === 1600 && max === 2099) return '1600-2099';
  if (min === 2100) return '2100+';
  return 'all';
}

export default function App() {
  const [view, setView] = useState<AppView>(viewFromHash);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [startingSync, setStartingSync] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [query, setQuery] = useState<ProblemQuery>(initialQuery);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ProblemList | null>(null);
  const [loading, setLoading] = useState(true);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showShortcut, setShowShortcut] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const next = await api.meta();
      setMeta(next);
      setSync(next.sync);
      setMetaError(null);
    } catch (error) {
      setMetaError(error instanceof Error ? error.message : '无法连接本地服务');
    }
  }, []);

  useEffect(() => {
    void loadMeta();
    void api.settings().then((settings) => applyAccent(settings.accentColor)).catch(() => undefined);
  }, [loadMeta]);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const navigate = (next: AppView) => {
    setView(next);
    const nextHash =
      next === 'dashboard'
        ? '#dashboard'
        : next === 'accounts'
          ? '#accounts'
          : next === 'weakness'
            ? '#weakness'
            : next === 'contests'
              ? '#contests'
              : next === 'contest-records'
                ? '#contest-records'
                : next === 'upsolve'
                  ? '#upsolve'
                  : next === 'submissions'
                ? '#submissions'
                : next === 'training'
                  ? '#training'
                  : next === 'settings'
                    ? '#settings'
                    : next === 'lists'
                      ? '#lists'
                      : '#problems';
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
  };

  const openTagInLibrary = (tag: string) => {
    setSearch('');
    setQuery({ ...initialQuery, tags: [tag] });
    navigate('problems');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((previous) =>
        previous.q === search ? previous : { ...previous, q: search, page: 1 },
      );
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .problems(query, controller.signal)
      .then((next) => {
        setData(next);
        setProblemError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setProblemError(error instanceof Error ? error.message : '题库加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refreshKey]);

  useEffect(() => {
    if (!sync?.running) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await api.syncStatus();
        if (cancelled) return;
        setSync(next);
        if (!next.running) {
          window.clearInterval(timer);
          await loadMeta();
          setRefreshKey((value) => value + 1);
          const failed = next.results.filter((result) => result.status === 'error');
          if (failed.length) {
            setSyncMessage(`部分平台同步失败：${failed.map((result) => PLATFORM_INFO[result.platform].label).join('、')}`);
          }
        }
      } catch {
        // 本地服务短暂不可用时，下一次轮询继续重试。
      }
    };

    const timer = window.setInterval(() => void tick(), 1100);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sync?.running, loadMeta]);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = window.setTimeout(() => setSyncMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [syncMessage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        searchRef.current?.focus();
        setShowShortcut(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hasFilters = Boolean(
    query.platform || query.q || query.min !== undefined || query.tags?.length || query.status,
  );

  const selectedPlatform = query.platform ?? 'all';
  const selectedStatus = query.status ?? 'all';
  const selectedTags = useMemo(() => query.tags ?? [], [query.tags]);

  const updateQuery = (patch: Partial<ProblemQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  };

  const handlePlatform = (platform: Platform | 'all') => {
    updateQuery({ platform: platform === 'all' ? undefined : platform });
  };

  const handleDifficulty = (difficulty: DifficultyPreset) => {
    const range = difficultyRange(difficulty);
    updateQuery({ min: range.min, max: range.max });
  };

  const handleStatus = (status: 'all' | 'todo' | 'attempted' | 'solved') => {
    updateQuery({ status: status === 'all' ? undefined : status });
  };

  const handleTag = (tag: string) => {
    if (!tag) {
      updateQuery({ tags: [] });
      return;
    }
    updateQuery({ tags: selectedTags.includes(tag) ? [] : [tag] });
  };

  const handleSort = (sort: SortOption) => {
    updateQuery({ sort });
  };

  const handleClear = () => {
    setSearch('');
    setQuery({ ...initialQuery });
  };

  const handleSync = async () => {
    if (sync?.running || startingSync) return;
    setStartingSync(true);
    setSyncMessage(null);
    try {
      await api.startSync();
      const next = await api.syncStatus();
      setSync(next);
      await loadMeta();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '同步启动失败');
    } finally {
      setStartingSync(false);
    }
  };

  const running = sync?.running ?? false;
  const difficultyPreset = presetFromRange(query.min, query.max);
  const selectedTag = selectedTags[0] ?? '';
  const lastSyncLabel = meta?.lastSync ? relativeTime(meta.lastSync) : '尚未同步';
  const lastDuration = meta?.recentRuns.find((run) => run.status === 'success')?.duration_ms;

  return (
    <div className="app-shell">
      <Sidebar meta={meta} activeView={view} onNavigate={navigate} />

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>训练舱</span>
            <i>/</i>
            <b>
              {view === 'dashboard'
                ? '总览'
                : view === 'accounts'
                  ? '账号同步'
                  : view === 'weakness'
                    ? '薄弱点'
                    : view === 'contests'
                      ? '近期比赛'
                      : view === 'contest-records'
                        ? '比赛记录'
                        : view === 'upsolve'
                          ? '补题队列'
                          : view === 'submissions'
                        ? '提交记录'
                        : view === 'training'
                          ? '训练计划'
                          : view === 'settings'
                            ? '设置'
                            : view === 'lists'
                              ? '洛谷题单'
                              : '题库'}
            </b>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span className="local-dot" />
              LOCAL MODE
            </span>
            {view === 'problems' ? (
              <button type="button" className="shortcut-hint" onClick={() => searchRef.current?.focus()}>
                <Command size={13} /> K
              </button>
            ) : null}
          </div>
        </header>

        {view === 'dashboard' ? (
          <DashboardPage onNavigate={navigate} />
        ) : view === 'accounts' ? (
          <AccountsPage />
        ) : view === 'weakness' ? (
          <WeaknessPage onNavigate={navigate} onPracticeTag={openTagInLibrary} />
        ) : view === 'contests' ? (
          <ContestsPage />
        ) : view === 'contest-records' ? (
          <ContestRecordsPage />
        ) : view === 'upsolve' ? (
          <UpsolvePage />
        ) : view === 'submissions' ? (
          <SubmissionsPage onNavigate={navigate} />
        ) : view === 'training' ? (
          <TrainingPage onNavigate={navigate} />
        ) : view === 'settings' ? (
          <SettingsPage onNavigate={navigate} />
        ) : view === 'lists' ? (
          <ProblemListsPage />
        ) : (
          <div className="page">
          <section className="hero">
            <div className="hero-copy">
              <div className="hero-eyebrow">
                <span className="live-dot" />
                PROBLEM REPOSITORY
                <span className="eyebrow-divider" />
                <span>题库中枢</span>
              </div>
              <h1>
                把三个平台，
                <br />
                <span>装进一个题库。</span>
              </h1>
              <p>
                Codeforces、AtCoder、洛谷全量题目统一索引。
                <br className="desktop-only" />
                难度、标签、通过率，一个界面看清。
              </p>
            </div>

            <div className="hero-actions">
              <div className="sync-stamp">
                <span>LAST SYNC</span>
                <strong>{lastSyncLabel}</strong>
                <small>
                  {lastDuration ? `耗时 ${formatDuration(lastDuration)}` : '等待第一次同步'}
                </small>
              </div>
              <button
                type="button"
                className={`primary-sync ${running ? 'is-running' : ''}`}
                onClick={() => void handleSync()}
                disabled={running || startingSync}
              >
                <RefreshCw size={17} />
                <span>{running ? '同步进行中' : startingSync ? '正在启动' : '全量同步题库'}</span>
              </button>
              <span className="sync-note">
                <Sparkles size={12} />
                增量写入 · 自动去重
              </span>
            </div>
          </section>

          {metaError ? (
            <div className="notice notice-error">
              <AlertTriangle size={16} />
              <span>无法连接本地服务：{metaError}</span>
              <button type="button" onClick={() => void loadMeta()}>重试</button>
            </div>
          ) : null}

          {syncMessage ? (
            <div className="notice">
              <AlertTriangle size={16} />
              <span>{syncMessage}</span>
              <button type="button" onClick={() => setSyncMessage(null)}>关闭</button>
            </div>
          ) : null}

          <StatsCards meta={meta} activePlatform={selectedPlatform} onSelectPlatform={handlePlatform} />

          <div className="content-grid">
            <div className="main-column">
              <Filters
                platform={selectedPlatform}
                difficulty={difficultyPreset}
                status={selectedStatus}
                tag={selectedTag}
                sort={query.sort}
                search={search}
                inputRef={searchRef}
                tags={meta?.tags ?? []}
                hasFilters={hasFilters}
                onChangePlatform={handlePlatform}
                onChangeDifficulty={handleDifficulty}
                onChangeStatus={handleStatus}
                onChangeTag={handleTag}
                onChangeSort={handleSort}
                onChangeSearch={setSearch}
                onClear={handleClear}
              />

              {problemError ? (
                <div className="notice notice-error">
                  <AlertTriangle size={16} />
                  <span>{problemError}</span>
                  <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
                    重试
                  </button>
                </div>
              ) : null}

              <ProblemTable
                data={data}
                loading={loading}
                onPageChange={(page) => setQuery((previous) => ({ ...previous, page }))}
                onPageSizeChange={(pageSize) =>
                  setQuery((previous) => ({ ...previous, pageSize, page: 1 }))
                }
                onTagClick={handleTag}
              />
            </div>

            <SidePanel
              meta={meta}
              sync={sync}
              onSync={() => void handleSync()}
              onSelectTag={handleTag}
            />
          </div>

          <footer className="page-footer">
            <span>AlgoPilot v0.2 · 题库同步</span>
            <span className="footer-sep" />
            <span>SQLite WAL · 本地优先</span>
            <span className="footer-spacer" />
            <span>按 <kbd>/</kbd> 或 <kbd>⌘K</kbd> 搜索题目</span>
          </footer>
        </div>
        )}
      </main>

      <div className="sr-only" aria-live="polite">
        {showShortcut ? '搜索框已聚焦' : ''}
      </div>
    </div>
  );
}
