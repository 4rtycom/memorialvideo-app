'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import {
  applyCreatorLibraryView,
  CREATOR_LIBRARY_FILTERS,
  CREATOR_LIBRARY_SORTS,
  creatorFilterLabel,
  type CreatorLibraryCard,
  type CreatorLibraryFilter,
  type CreatorLibrarySort,
} from '@/lib/library-filters';

const FILTER_SHORT: CreatorLibraryFilter[] = [
  'all',
  'processing',
  'ready',
  'needs_attention',
  'from_contributors',
];

export function MemoryLibraryFilters({ cards }: { cards: CreatorLibraryCard[] }) {
  const [filter, setFilter] = useState<CreatorLibraryFilter>('all');
  const [sort, setSort] = useState<CreatorLibrarySort>('newest');
  const [query, setQuery] = useState('');

  const filtersInUse = useMemo(() => {
    return FILTER_SHORT.filter((item) => {
      if (item === 'all') return true;
      if (item === 'from_contributors') {
        return cards.some((c) => c.source === 'contributor') || filter === item;
      }
      if (item === 'processing') {
        return (
          cards.some(
            (c) => c.uiStatus === 'uploading' || c.uiStatus === 'processing' || c.uiStatus === 'queued',
          ) || filter === item
        );
      }
      if (item === 'needs_attention') {
        return cards.some((c) => c.uiStatus === 'needs_attention' || c.uiStatus === 'error') || filter === item;
      }
      return cards.some((c) => c.uiStatus === 'ready') || filter === item;
    });
  }, [cards, filter]);

  const visible = useMemo(
    () => applyCreatorLibraryView(cards, { filter, query, sort }),
    [cards, filter, query, sort],
  );

  const preparingCount = cards.filter(
    (c) => c.uiStatus === 'uploading' || c.uiStatus === 'processing' || c.uiStatus === 'queued',
  ).length;

  return (
    <>
      <div className="card !py-4 !px-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex-1 min-w-[180px]">
          <span className="sr-only">Search memories</span>
          <input
            className="field !min-h-[44px]"
            placeholder="⌕  Search memories"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <label className="text-[14px] text-[color:var(--muted)] flex items-center gap-2">
          <span className="sr-only">Sort</span>
          <select
            className="field !min-h-[44px] !w-auto"
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as CreatorLibrarySort)}
          >
            {CREATOR_LIBRARY_SORTS.map((item) => (
              <option key={item} value={item}>
                {item === 'newest' ? 'Newest first' : item === 'oldest' ? 'Oldest first' : 'Title'}
              </option>
            ))}
          </select>
        </label>
        {preparingCount > 0 ? (
          <span className="text-[14px] text-[color:var(--accent)]">Still preparing ({preparingCount})</span>
        ) : null}
      </div>

      <div
        className="library-filter-bar mb-6"
        role="toolbar"
        aria-label="Memory filters"
      >
        {filtersInUse.map((item) => (
          <button
            key={item}
            type="button"
            className={`library-filter-chip ${filter === item ? 'is-active' : ''}`}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {creatorFilterLabel(item)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card soft !p-7">
          <h3 className="serif text-[28px] m-0 mb-2">No memories match</h3>
          <p className="text-[color:var(--muted)] m-0">
            Try another filter, or clear search. Preparing uploads appear under “Still preparing”.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <article key={m.id} className="memory-card">
              <div className="relative h-[136px]">
                {m.contentType?.startsWith('audio/') ? (
                  <div className="flex h-full items-center justify-center rounded-[10px] bg-[color:var(--paper)] text-[13px] text-[color:var(--muted)]">
                    Personal song
                  </div>
                ) : m.contentType?.startsWith('video/') ? (
                  <video src={m.imagePath} className="h-full w-full rounded-[10px] object-cover" muted />
                ) : (
                  <Image src={m.imagePath} alt="" fill className="object-cover rounded-[10px]" sizes="150px" />
                )}
              </div>
              <div className="py-2 pr-2 flex flex-col">
                <div className="text-[12px] font-medium text-[color:var(--accent)]">{m.year || '—'}</div>
                <h3 className="serif text-[17px] m-0 mt-2 leading-tight">{m.title}</h3>
                <p className="text-[12px] text-[color:var(--muted)] mt-auto mb-1">
                  {m.source === 'contributor' ? `${m.label} · Contributor` : m.label}
                  {m.reviewState === 'pending' ? ' · Awaiting review' : ''}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-[13px] text-[color:var(--muted)] mt-4" role="status">
        Showing {visible.length} of {cards.length}
        {filter !== 'all' ? ` · ${creatorFilterLabel(filter)}` : ''}
        {CREATOR_LIBRARY_FILTERS.includes(filter) ? '' : ''}
      </p>
    </>
  );
}
