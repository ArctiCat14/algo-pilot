import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  Layers3,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type {
  LocalProblemList,
  LocalProblemListDetail,
  LuoguTrainingSummary,
  ProblemListItem,
} from '../types';
import { formatNumber } from '../format';

function statusLabel(status: ProblemListItem['status']): string {
  if (status === 'solved') return '已通过';
  if (status === 'attempted') return '尝试未过';
  return '未做';
}

export function ProblemListsPage() {
  const [lists, setLists] = useState<LocalProblemList[]>([]);
  const [catalog, setCatalog] = useState<LuoguTrainingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LocalProblemListDetail | null>(null);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'list' | 'ids'>('list');
  const [listQuery, setListQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadLists = useCallback(async (preferredId?: number) => {
    const response = await api.lists();
    setLists(response.items);
    if (preferredId) {
      setSelectedId(preferredId);
    } else if (response.items.length) {
      setSelectedId((current) =>
        current && response.items.some((item) => item.id === current)
          ? current
          : response.items[0].id,
      );
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      loadLists(),
      api
        .discoverLists()
        .then((response) => setCatalog(response.items))
        .catch(() => setCatalog([]))
        .finally(() => setCatalogLoading(false)),
    ])
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '题单加载失败');
      })
      .finally(() => setLoading(false));
  }, [loadLists]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetailLoading(true);
    api
      .listDetail(selectedId, controller.signal)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '题单详情加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const importList = async (value: string, fromCatalog = false) => {
    const target = value.trim();
    if (!target) {
      setError('请输入洛谷题单 ID 或链接');
      return;
    }
    if (fromCatalog) setImportingId(target);
    else setImporting(true);
    setError(null);
    try {
      const result = await api.importList(target);
      await loadLists(result.id);
      setDetail(result);
      setInput('');
      setToast(`已导入《${result.name}》· ${result.problemCount} 道题`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '题单导入失败');
    } finally {
      setImporting(false);
      setImportingId(null);
    }
  };

  const importByIds = async () => {
    if (!customInput.trim()) {
      setError('请输入至少一个洛谷题号');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await api.importCustomList(customInput, customName);
      await loadLists(result.id);
      setDetail(result);
      setCustomInput('');
      setCustomName('');
      setMode('list');
      const warning = result.warnings?.length ? `，${result.warnings.join('；')}` : '';
      setToast(`已创建《${result.name}》· ${result.problemCount} 道题${warning}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '题号导入失败');
    } finally {
      setImporting(false);
    }
  };

  const addIds = async () => {
    if (!detail || !addInput.trim()) {
      setError('请输入要添加到当前题单的题号');
      return;
    }
    setBusyKey('add');
    setError(null);
    try {
      const result = await api.addListItems(detail.id, addInput);
      setDetail(result);
      setAddInput('');
      setAddOpen(false);
      await loadLists(result.id);
      const warning = result.warnings?.length ? `，${result.warnings.join('；')}` : '';
      setToast(`已更新题单 · 共 ${result.problemCount} 道题${warning}`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : '添加题号失败');
    } finally {
      setBusyKey(null);
    }
  };

  const shift = (problemKey?: string) => {
    if (!detail) return;
    setBusyKey(problemKey ?? 'all');
    api
      .addListToPlan(detail.id, problemKey)
      .then((result) => {
        setToast(result.message);
      })
      .catch((planError) => {
        setError(planError instanceof Error ? planError.message : '加入训练计划失败');
      })
      .finally(() => setBusyKey(null));
  };

  const remove = async () => {
    if (!detail) return;
    if (!window.confirm(`确定删除本地题单《${detail.name}》？不会影响洛谷原题单。`)) return;
    try {
      await api.deleteList(detail.id);
      setDetail(null);
      setSelectedId(null);
      await loadLists();
      setToast('题单已删除');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    }
  };

  const percent = detail?.problemCount
    ? Math.round((detail.solvedCount / detail.problemCount) * 100)
    : 0;
  const filteredLists = lists.filter((list) =>
    listQuery.trim()
      ? list.name.toLowerCase().includes(listQuery.trim().toLowerCase())
      : true,
  );

  return (
    <div className="page lists-page">
      <section className="lists-hero">
        <div className="lists-hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            LUOGU TRAINING SETS
            <span className="eyebrow-divider" />
            <span>洛谷题单</span>
          </div>
          <h1>
            把专题题单，
            <br />
            <span>搬进训练台。</span>
          </h1>
          <p>
            导入洛谷公开题单，保留题目顺序，自动同步过题状态。
            <br className="desktop-only" />
            看到值得练的专题，可以直接加入今日训练。
          </p>
        </div>
        <form
          className="list-import-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'list') void importList(input);
            else void importByIds();
          }}
        >
          <div className="import-tabs">
            <button
              type="button"
              className={mode === 'list' ? 'is-active' : ''}
              onClick={() => setMode('list')}
            >
              导入题单
            </button>
            <button
              type="button"
              className={mode === 'ids' ? 'is-active' : ''}
              onClick={() => setMode('ids')}
            >
              按题号新建
            </button>
          </div>
          {mode === 'list' ? (
            <>
              <strong>导入洛谷题单</strong>
              <div className="list-import-row">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="题单 ID 或链接，例如 100"
                  spellCheck={false}
                  disabled={importing}
                />
                <button type="submit" disabled={importing}>
                  {importing ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  {importing ? '导入中' : '导入'}
                </button>
              </div>
              <small>支持 `luogu.com.cn/training/100` 这样的公开题单链接</small>
            </>
          ) : (
            <>
              <strong>用题号建一个题单</strong>
              <input
                className="list-custom-name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="题单名称（可选）"
                maxLength={80}
                disabled={importing}
              />
              <textarea
                className="list-import-textarea"
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                placeholder={'每行或逗号分隔，例如：\nP1001, B2002\nP1048 P1873'}
                rows={3}
                spellCheck={false}
                disabled={importing}
              />
              <div className="list-import-row">
                <button type="submit" disabled={importing}>
                  {importing ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  {importing ? '导入中' : '创建题单'}
                </button>
              </div>
              <small>支持洛谷题号、题目链接；最多一次 60 道</small>
            </>
          )}
        </form>
      </section>

      {error ? (
        <div className="notice notice-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      ) : null}

      {toast ? (
        <div className="notice">
          <CheckCircle2 size={16} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)}>关闭</button>
        </div>
      ) : null}

      <div className="lists-layout">
        <aside className="lists-side">
          <section className="lists-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">MY COLLECTIONS</span>
                <h2>我的题单</h2>
              </div>
              <span className="panel-meta">{lists.length} 个</span>
            </div>

            <label className="list-filter">
              <Search size={13} />
              <input
                value={listQuery}
                onChange={(event) => setListQuery(event.target.value)}
                placeholder="搜索题单…"
                spellCheck={false}
              />
            </label>

            {loading ? (
              <div className="lists-loading"><Loader2 size={16} className="spin" /> 加载中</div>
            ) : filteredLists.length ? (
              <div className="list-card-list">
                {filteredLists.map((list) => {
                  const progress = list.problemCount
                    ? Math.round((list.solvedCount / list.problemCount) * 100)
                    : 0;
                  return (
                    <button
                      type="button"
                      key={list.id}
                      className={`list-card ${selectedId === list.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedId(list.id)}
                    >
                      <span className="list-card-title">{list.name}</span>
                      <span className="list-card-meta">
                        {list.provider || '洛谷'} · {list.problemCount} 题
                      </span>
                      <span className="list-card-progress">
                        <i style={{ width: `${progress}%` }} />
                      </span>
                      <span className="list-card-nums">
                        <b>{list.solvedCount}</b> / {list.problemCount} 已过
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="lists-empty">
                <BookOpenCheck size={24} />
                <strong>{lists.length ? '没有匹配的题单' : '还没有导入题单'}</strong>
                <span>
                  {lists.length
                    ? '换一个关键词试试。'
                    : '输入 ID，或从下方官方题单开始。'}
                </span>
              </div>
            )}
          </section>

          <section className="lists-panel catalog-panel">
            <div className="account-panel-head">
              <div>
                <span className="eyebrow">LUOGU OFFICIAL</span>
                <h2>洛谷官方题单</h2>
              </div>
              <span className="panel-meta">快速导入</span>
            </div>
            {catalogLoading ? (
              <div className="lists-loading"><Loader2 size={16} className="spin" /> 正在读取目录</div>
            ) : (
              <div className="catalog-list">
                {catalog.slice(0, 8).map((item) => (
                  <div className="catalog-row" key={item.externalId}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.problemCount} 题 · {formatNumber(item.markCount)} 人收藏</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void importList(item.externalId, true)}
                      disabled={importingId === item.externalId}
                    >
                      {importingId === item.externalId ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                      导入
                    </button>
                  </div>
                ))}
                {!catalog.length ? <p className="lists-empty-text">目录暂时不可用。</p> : null}
              </div>
            )}
          </section>
        </aside>

        <main className="lists-panel list-detail-panel">
          {detailLoading ? (
            <div className="list-detail-loading"><Loader2 size={20} className="spin" /> 正在读取题单题目…</div>
          ) : detail ? (
            <>
              <div className="list-detail-head">
                <div>
                  <div className="list-detail-badges">
                    <span>{detail.externalId.startsWith('custom-') ? '自定义题单' : '洛谷题单'}</span>
                    {!detail.externalId.startsWith('custom-') ? (
                      <span>#{detail.externalId}</span>
                    ) : null}
                    {detail.solvedCount === detail.problemCount && detail.problemCount > 0 ? (
                      <span className="is-complete"><Check size={11} /> 已完成</span>
                    ) : null}
                  </div>
                  <h2>{detail.name}</h2>
                  <p className="list-detail-provider">
                    {detail.provider || '洛谷'} · {detail.problemCount} 道题 · 已过 {detail.solvedCount}
                  </p>
                </div>
                <div className="list-detail-actions">
                  <button type="button" onClick={() => setAddOpen((open) => !open)}>
                    <Plus size={13} /> 添加题号
                  </button>
                  {detail.url ? (
                    <a href={detail.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> 洛谷原题单
                    </a>
                  ) : null}
                  <button type="button" className="is-danger" onClick={() => void remove()}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {detail.description ? <p className="list-description">{detail.description}</p> : null}

              {addOpen ? (
                <div className="list-add-panel">
                  <textarea
                    value={addInput}
                    onChange={(event) => setAddInput(event.target.value)}
                    placeholder="输入题号，多个用空格、逗号或换行分隔：P1001, B2002"
                    rows={2}
                    spellCheck={false}
                  />
                  <div>
                    <button type="button" onClick={() => setAddOpen(false)}>取消</button>
                    <button type="button" className="is-primary" onClick={() => void addIds()} disabled={busyKey === 'add'}>
                      {busyKey === 'add' ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                      加入题单
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="list-progress-row">
                <div>
                  <span>完成进度</span>
                  <strong>{percent}%</strong>
                </div>
                <div className="list-progress-track"><i style={{ width: `${percent}%` }} /></div>
                <button type="button" onClick={() => shift()} disabled={busyKey !== null}>
                  {busyKey === 'all' ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                  加入今日训练
                </button>
              </div>

              <div className="list-item-table-wrap">
                <table className="list-item-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>状态</th>
                      <th>题目</th>
                      <th>难度</th>
                      <th>标签</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.problemKey}>
                        <td className="list-position">{String(item.position).padStart(2, '0')}</td>
                        <td>
                          <span className={`list-status status-${item.status}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td>
                          <a href={item.url} target="_blank" rel="noreferrer" className="list-problem-title">
                            {item.title}
                            <span>{item.pid}</span>
                          </a>
                        </td>
                        <td className="list-difficulty">{item.difficulty ?? '—'}</td>
                        <td>
                          <div className="list-tags">
                            {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                            {!item.tags.length ? <span className="tag-empty">—</span> : null}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="list-add-one"
                            onClick={() => shift(item.problemKey)}
                            disabled={busyKey !== null || item.status === 'solved'}
                            title={item.status === 'solved' ? '已通过，不需要加入' : '加入今日训练'}
                          >
                            {busyKey === item.problemKey ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="list-detail-foot">
                <span><Layers3 size={12} /> 顺序与洛谷题单保持一致</span>
                <span><Link2 size={12} /> 导入不会修改洛谷原题单</span>
              </div>
            </>
          ) : (
            <div className="list-detail-empty">
              <BookOpenCheck size={32} />
              <h2>选择一个题单</h2>
              <p>从左侧导入或打开题单，查看题目、进度，并加入今日训练。</p>
            </div>
          )}
        </main>
      </div>

      <footer className="page-footer">
        <span>AlgoPilot v1.1 · 洛谷题单</span>
        <span className="footer-sep" />
        <span>公开题单 · 本地保存 · 过题状态自动同步</span>
        <span className="footer-spacer" />
        <span>{lists.length} 个题单 · {formatNumber(lists.reduce((sum, list) => sum + list.problemCount, 0))} 道题</span>
      </footer>
    </div>
  );
}
