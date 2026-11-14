import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Database,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Target,
  UserRound,
} from 'lucide-react';
import { api } from '../api';
import type { AccountOverview, TaskBoard, TrainingSettings } from '../types';
import { PLATFORM_INFO } from '../types';
import { formatNumber, relativeTime } from '../format';
import { applyAccent } from '../theme';

const PLATFORM_OPTIONS = ['codeforces', 'atcoder', 'luogu'] as const;

const ACCENT_PRESETS = [
  { name: '青柠', value: '#d5ff66' },
  { name: '冰蓝', value: '#66e3ff' },
  { name: '薄荷', value: '#7fffc4' },
  { name: '琥珀', value: '#ffc766' },
  { name: '玫瑰', value: '#ff8fa3' },
  { name: '紫罗兰', value: '#b19cff' },
];

interface SettingsPageProps {
  onNavigate: (view: 'accounts' | 'training' | 'problems') => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.settings(), api.tasks(), api.accounts()])
      .then(([nextSettings, nextBoard, accounts]) => {
        setSettings(nextSettings);
        setBoard(nextBoard);
        setOverview(accounts.overview);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '设置加载失败');
      })
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<TrainingSettings>) => {
    setSettings((previous) => (previous ? { ...previous, ...patch } : previous));
    setSaved(false);
  };

  const chooseAccent = (color: string) => {
    update({ accentColor: color });
    applyAccent(color);
  };

  const togglePlatform = (platform: (typeof PLATFORM_OPTIONS)[number]) => {
    if (!settings) return;
    const exists = settings.preferredPlatforms.includes(platform);
    const next = exists
      ? settings.preferredPlatforms.filter((item) => item !== platform)
      : [...settings.preferredPlatforms, platform];
    if (!next.length) return;
    update({ preferredPlatforms: next });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await api.saveSettings(settings);
      setSettings(result);
      applyAccent(result.accentColor);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page settings-page">
        <div className="settings-loading"><Loader2 size={22} className="spin" /> 正在读取设置…</div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <section className="settings-hero">
        <div>
          <div className="hero-eyebrow">
            <span className="live-dot" />
            TRAINING PREFERENCES
            <span className="eyebrow-divider" />
            <span>设置</span>
          </div>
          <h1>
            调好节奏，
            <br />
            <span>再开始训练。</span>
          </h1>
          <p>
            目标 rating 决定选题难度，每日题量决定训练强度。
            <br className="desktop-only" />
            这些设置只影响接下来的计划，不改动历史记录。
          </p>
        </div>
        <div className="settings-hero-actions">
          <div className="settings-sync-info">
            <span>数据状态</span>
            <strong>{overview ? `${formatNumber(overview.totalSubmissions)} 条提交` : '—'}</strong>
            <small>最近更新 {relativeTime(overview?.lastSync)}</small>
          </div>
          <button type="button" className="weakness-refresh" onClick={() => onNavigate('accounts')}>
            <UserRound size={14} /> 管理账号
          </button>
        </div>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      ) : null}

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">TARGET</span>
                <h2>目标 rating</h2>
              </div>
              <Target size={16} className="head-icon" />
            </div>
            <p className="settings-description">
              生成计划时，弱项题会落在目标下 200 分，拉伸题会落在目标上 200 分左右。
            </p>
            <div className="rating-presets">
              {[1200, 1400, 1600, 1800, 2100].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={settings?.targetRating === rating ? 'is-active' : ''}
                  onClick={() => update({ targetRating: rating })}
                >
                  {rating}
                </button>
              ))}
            </div>
            <label className="rating-input">
              <input
                type="range"
                min={800}
                max={3200}
                step={50}
                value={settings?.targetRating ?? 1500}
                onChange={(event) => update({ targetRating: Number(event.target.value) })}
              />
              <strong>{settings?.targetRating ?? 1500}</strong>
            </label>
          </section>

          <section className="settings-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">APPEARANCE</span>
                <h2>重点色</h2>
              </div>
              <Palette size={16} className="head-icon" />
            </div>
            <p className="settings-description">
              重点色用于强调按钮、链接、进度和状态高亮。选择后会立即预览，保存后全局生效。
            </p>
            <div className="accent-options">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={settings?.accentColor === preset.value ? 'is-active' : ''}
                  onClick={() => chooseAccent(preset.value)}
                  title={preset.name}
                >
                  <i style={{ background: preset.value }} />
                  {preset.name}
                  {settings?.accentColor === preset.value ? <Check size={12} /> : null}
                </button>
              ))}
              <label className="accent-custom">
                <input
                  type="color"
                  value={settings?.accentColor ?? '#d5ff66'}
                  onChange={(event) => chooseAccent(event.target.value)}
                />
                自定义
              </label>
            </div>
            <div className="accent-preview">
              <span>预览</span>
              <button type="button">主要按钮</button>
              <b>1,500</b>
            </div>
          </section>

          <section className="settings-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">VOLUME</span>
                <h2>每日题量</h2>
              </div>
              <RefreshCw size={16} className="head-icon" />
            </div>
            <p className="settings-description">
              建议从 3 题开始：1 道弱项、1 道舒适区、1 道拉伸。稳定之后再增加。
            </p>
            <div className="goal-options">
              {[1, 2, 3, 4, 5, 6].map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={settings?.dailyGoal === goal ? 'is-active' : ''}
                  onClick={() => update({ dailyGoal: goal })}
                >
                  <b>{goal}</b>
                  <span>题 / 天</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">PLATFORMS</span>
                <h2>优先训练平台</h2>
              </div>
              <Database size={16} className="head-icon" />
            </div>
            <p className="settings-description">
              生成计划时会从勾选的平台中选题；至少保留一个。
            </p>
            <div className="platform-options">
              {PLATFORM_OPTIONS.map((platform) => {
                const active = settings?.preferredPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    className={active ? 'is-active' : ''}
                    onClick={() => togglePlatform(platform)}
                  >
                    <i style={{ background: PLATFORM_INFO[platform].color }} />
                    {PLATFORM_INFO[platform].label}
                    <span>{active ? <Check size={12} /> : null}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <button type="button" className="settings-save" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={15} className="spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saving ? '保存中' : saved ? '已保存' : '保存训练偏好'}
          </button>
        </div>

        <aside className="settings-side">
          <section className="settings-side-card">
            <span className="eyebrow">CURRENT PLAN</span>
            <h2>今日计划</h2>
            <div className="settings-plan-metric">
              <strong>{board?.stats.done ?? 0} / {board?.stats.total ?? 0}</strong>
              <span>道完成</span>
            </div>
            <div className="settings-plan-bar">
              <i style={{ width: `${board?.stats.percent ?? 0}%` }} />
            </div>
            <button type="button" onClick={() => onNavigate('training')}>
              打开训练计划 <ChevronRight size={13} />
            </button>
          </section>

          <section className="settings-side-card">
            <span className="eyebrow">DATA SOURCE</span>
            <h2>本地数据</h2>
            <div className="settings-data-row">
              <span>已绑定平台</span>
              <b>{overview?.accounts.length ?? 0} / 3</b>
            </div>
            <div className="settings-data-row">
              <span>提交记录</span>
              <b>{overview ? formatNumber(overview.totalSubmissions) : '—'}</b>
            </div>
            <div className="settings-data-row">
              <span>过题数</span>
              <b>{overview ? formatNumber(overview.totalSolved) : '—'}</b>
            </div>
            <p className="settings-note">
              所有数据保存在本机 SQLite，不会上传。题目同步和账号同步是分开的。
            </p>
            <button type="button" onClick={() => onNavigate('problems')}>
              浏览题库 <ChevronRight size={13} />
            </button>
          </section>
        </aside>
      </div>

      <footer className="page-footer">
        <span>AlgoPilot v0.7 · 训练偏好</span>
        <span className="footer-sep" />
        <span>本地设置 · 即时生效</span>
        <span className="footer-spacer" />
        <span>修改后可回到训练计划重新生成</span>
      </footer>
    </div>
  );
}
