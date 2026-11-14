import { Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { Platform, SortOption } from '../types';
import { PLATFORM_INFO } from '../types';

export type DifficultyPreset = 'all' | '0-999' | '1000-1599' | '1600-2099' | '2100+';

interface FiltersProps {
  platform: Platform | 'all';
  difficulty: DifficultyPreset;
  status: 'all' | 'todo' | 'attempted' | 'solved';
  tag: string;
  sort: SortOption;
  search: string;
  inputRef: RefObject<HTMLInputElement | null>;
  tags: Array<{ tag: string; count: number }>;
  hasFilters: boolean;
  onChangePlatform: (platform: Platform | 'all') => void;
  onChangeDifficulty: (difficulty: DifficultyPreset) => void;
  onChangeStatus: (status: 'all' | 'todo' | 'attempted' | 'solved') => void;
  onChangeTag: (tag: string) => void;
  onChangeSort: (sort: SortOption) => void;
  onChangeSearch: (search: string) => void;
  onClear: () => void;
}

const difficultyOptions: Array<{ value: DifficultyPreset; label: string }> = [
  { value: 'all', label: '全部难度' },
  { value: '0-999', label: '入门' },
  { value: '1000-1599', label: '普及' },
  { value: '1600-2099', label: '提高' },
  { value: '2100+', label: '省选+' },
];

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: 'default', label: '平台默认' },
  { value: 'difficulty_asc', label: '难度从低到高' },
  { value: 'difficulty_desc', label: '难度从高到低' },
  { value: 'acceptance', label: '通过率从低到高' },
  { value: 'newest', label: '最近同步' },
  { value: 'title', label: '标题 A–Z' },
];

export function Filters({
  platform,
  difficulty,
  status,
  tag,
  sort,
  search,
  inputRef,
  tags,
  hasFilters,
  onChangePlatform,
  onChangeDifficulty,
  onChangeStatus,
  onChangeTag,
  onChangeSort,
  onChangeSearch,
  onClear,
}: FiltersProps) {
  return (
    <section className="filter-panel">
      <div className="filter-main">
        <div className="platform-tabs" role="tablist" aria-label="按平台筛选">
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'all'}
            className={platform === 'all' ? 'is-active' : ''}
            onClick={() => onChangePlatform('all')}
          >
            全部
          </button>
          {(['codeforces', 'atcoder', 'luogu'] as Platform[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={platform === item}
              className={platform === item ? 'is-active' : ''}
              onClick={() => onChangePlatform(item)}
            >
              <i style={{ background: PLATFORM_INFO[item].color }} />
              {PLATFORM_INFO[item].label}
            </button>
          ))}
        </div>

        <label className="search-box">
          <Search size={17} />
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => onChangeSearch(event.target.value)}
            placeholder="搜索题目名称、题号…"
            spellCheck={false}
          />
          {search ? (
            <button type="button" aria-label="清空搜索" onClick={() => onChangeSearch('')}>
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
      </div>

      <div className="filter-status-row">
        <span className="filter-label">状态</span>
        {[
          { value: 'all', label: '全部' },
          { value: 'todo', label: '未做' },
          { value: 'attempted', label: '尝试未过' },
          { value: 'solved', label: '已通过' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? 'is-active' : ''}
            onClick={() =>
              onChangeStatus(option.value as 'all' | 'todo' | 'attempted' | 'solved')
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="filter-sub">
        <div className="difficulty-chips">
          <span className="filter-label">
            <SlidersHorizontal size={14} /> 难度
          </span>
          {difficultyOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={difficulty === option.value ? 'is-active' : ''}
              onClick={() => onChangeDifficulty(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="filter-selects">
          <label className="select-wrap">
            <Tag size={14} />
            <select value={tag} onChange={(event) => onChangeTag(event.target.value)}>
              <option value="">全部标签</option>
              {tags.map((item) => (
                <option key={item.tag} value={item.tag}>
                  {item.tag} · {item.count}
                </option>
              ))}
            </select>
          </label>

          <label className="select-wrap">
            <select value={sort} onChange={(event) => onChangeSort(event.target.value as SortOption)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {hasFilters ? (
            <button type="button" className="clear-filters" onClick={onClear}>
              <X size={13} /> 清除筛选
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
