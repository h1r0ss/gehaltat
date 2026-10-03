// Sorting and pagination of the records list. Pure functions, imported by Node tests.
import type { SalaryRecord } from '../types.ts';
import { basisValue } from './stats.ts';

export type SortField = 'date' | 'gross' | 'net' | 'experience';
export type SortDirection = 'asc' | 'desc';
export type SortKey = `${SortField}-${SortDirection}`;

// Display labels live in the i18n dictionaries under `records.sort.<key>`
// (see src/i18n/en.ts / de.ts) so the sort dropdown can be translated.
export const SORT_KEYS: readonly SortKey[] = [
  'date-desc',
  'date-asc',
  'gross-desc',
  'gross-asc',
  'net-desc',
  'net-asc',
  'experience-desc',
  'experience-asc',
];

export const DEFAULT_SORT: SortKey = 'date-desc';

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export function parseSortKey(key: SortKey): { field: SortField; direction: SortDirection } {
  const [field, direction] = key.split('-') as [SortField, SortDirection];
  return { field, direction };
}

function sortValue(record: SalaryRecord, field: SortField): string | number | null {
  switch (field) {
    case 'date':
      return record.postDate || null;
    case 'gross':
      // Like the benchmark: a salary paid 12 times a year sorts by its 14-payment equivalent.
      return basisValue(record, 'grossMonthly');
    case 'net':
      return record.netMonthly;
    case 'experience':
      return record.experienceYears;
  }
}

/** Returns a new array. Missing values always sort last; ties fall back to newest first, then id. */
export function sortRecords(records: readonly SalaryRecord[], key: SortKey): SalaryRecord[] {
  const { field, direction } = parseSortKey(key);
  const sign = direction === 'asc' ? 1 : -1;
  return records.slice().sort((a, b) => {
    const va = sortValue(a, field);
    const vb = sortValue(b, field);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -sign;
      if (va > vb) return sign;
    }
    if (a.postDate !== b.postDate) return a.postDate < b.postDate ? 1 : -1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

/** Records revealed per "Show more" click in the salary feed. */
export const LOAD_MORE_STEP = 20;

export type Page<T> = {
  items: T[];
  /** Current page, clamped to [1, pageCount]. */
  page: number;
  pageCount: number;
  /** 1-based index of the first item on the page (0 when empty). */
  start: number;
  /** 1-based index of the last item on the page (0 when empty). */
  end: number;
  total: number;
};

export function paginate<T>(items: readonly T[], page: number, pageSize: number = LOAD_MORE_STEP): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const offset = (current - 1) * pageSize;
  const slice = items.slice(offset, offset + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    start: slice.length > 0 ? offset + 1 : 0,
    end: offset + slice.length,
    total,
  };
}
