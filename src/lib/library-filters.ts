import type { AssetUiStatus } from '@memorialvideo/domain';
import { mapAssetStatusToUi } from '@memorialvideo/domain';

/** Creator Memory Library filters (ingest-focused; analysis filters wait on Supabase). */
export const CREATOR_LIBRARY_FILTERS = [
  'all',
  'processing',
  'ready',
  'needs_attention',
  'from_contributors',
] as const;

export type CreatorLibraryFilter = (typeof CREATOR_LIBRARY_FILTERS)[number];

export const CREATOR_LIBRARY_SORTS = ['newest', 'oldest', 'title'] as const;
export type CreatorLibrarySort = (typeof CREATOR_LIBRARY_SORTS)[number];

export type CreatorLibraryCard = {
  id: string;
  title: string;
  year: string;
  uiStatus: AssetUiStatus;
  label: string;
  imagePath: string;
  createdAt: string;
  source: 'owner' | 'contributor';
  reviewState: 'pending' | 'accepted' | 'declined';
};

export function filterCreatorLibrary(
  cards: readonly CreatorLibraryCard[],
  filter: CreatorLibraryFilter,
): CreatorLibraryCard[] {
  return cards.filter((card) => {
    switch (filter) {
      case 'all':
        return true;
      case 'processing':
        return card.uiStatus === 'uploading' || card.uiStatus === 'processing' || card.uiStatus === 'queued';
      case 'ready':
        return card.uiStatus === 'ready';
      case 'needs_attention':
        return card.uiStatus === 'needs_attention' || card.uiStatus === 'error';
      case 'from_contributors':
        return card.source === 'contributor';
      default:
        return true;
    }
  });
}

export function searchCreatorLibrary(
  cards: readonly CreatorLibraryCard[],
  query: string,
): CreatorLibraryCard[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...cards];
  }
  return cards.filter(
    (card) =>
      card.title.toLowerCase().includes(q) ||
      card.year.toLowerCase().includes(q) ||
      card.label.toLowerCase().includes(q),
  );
}

export function sortCreatorLibrary(
  cards: readonly CreatorLibraryCard[],
  sort: CreatorLibrarySort,
): CreatorLibraryCard[] {
  return [...cards].sort((left, right) => {
    if (sort === 'title') {
      return left.title.localeCompare(right.title) || right.createdAt.localeCompare(left.createdAt);
    }
    if (sort === 'oldest') {
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    }
    return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
  });
}

export function applyCreatorLibraryView(
  cards: readonly CreatorLibraryCard[],
  input: { filter: CreatorLibraryFilter; query: string; sort: CreatorLibrarySort },
): CreatorLibraryCard[] {
  const filtered = filterCreatorLibrary(cards, input.filter);
  const searched = searchCreatorLibrary(filtered, input.query);
  return sortCreatorLibrary(searched, input.sort);
}

export function creatorFilterLabel(filter: CreatorLibraryFilter): string {
  switch (filter) {
    case 'processing':
      return 'Still preparing';
    case 'ready':
      return 'Ready for film';
    case 'needs_attention':
      return 'Needs attention';
    case 'from_contributors':
      return 'From contributors';
    default:
      return 'All memories';
  }
}

export function isProcessingIngest(ingestStatus: string): boolean {
  const ui = mapAssetStatusToUi(ingestStatus);
  return ui === 'uploading' || ui === 'processing' || ui === 'queued';
}
