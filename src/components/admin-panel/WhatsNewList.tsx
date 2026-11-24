'use client';

import { useMemo } from 'react';
import { CalendarDays, EyeOff, FileText, Search } from 'lucide-react';

import type { WhatsNewEntry } from '@/types/whats-new';
import { cn } from '@/lib/utils';

type WhatsNewListProps = {
  entries: WhatsNewEntry[];
  selectedId: string | null;
  isLoading: boolean;
  search: string;
  includeInactive: boolean;
  onSearchChange: (value: string) => void;
  onIncludeInactiveChange: (value: boolean) => void;
  onSelect: (entry: WhatsNewEntry) => void;
};

/**
 * `date` is a MySQL DATE ("2026-11-24"). `new Date()` would read it as UTC
 * midnight and shift the day backwards for anyone behind UTC, so the parts are
 * formatted directly.
 */
export function formatEntryDate(value: string): string {
  const [datePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** First line of the entry, used as a label when no title was given. */
function previewLine(entry: WhatsNewEntry): string {
  const firstLine = entry.description.split('\n').find((line) => line.trim().length > 0);
  return firstLine?.replace(/^•\s*/, '').trim() || 'Untitled update';
}

export default function WhatsNewList({
  entries,
  selectedId,
  isLoading,
  search,
  includeInactive,
  onSearchChange,
  onIncludeInactiveChange,
  onSelect,
}: Readonly<WhatsNewListProps>) {
  // Entries arrive newest-first from the API; group them under their date
  // without disturbing that order.
  const groups = useMemo(() => {
    const byDate = new Map<string, WhatsNewEntry[]>();

    entries.forEach((entry) => {
      const key = entry.date.split('T')[0];
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(entry);
    });

    return Array.from(byDate.entries());
  }, [entries]);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="shrink-0 space-y-2.5 border-b border-gray-200 px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search updates"
            aria-label="Search updates"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30 focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => onIncludeInactiveChange(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-teal-600"
          />
          Show hidden entries
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <FileText className="h-7 w-7 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">No updates yet</p>
            <p className="text-xs text-gray-400">
              {search ? 'Nothing matches that search.' : 'Create the first entry to get started.'}
            </p>
          </div>
        ) : (
          groups.map(([date, dateEntries]) => (
            <section key={date} className="mb-2">
              <h3 className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatEntryDate(date)}
              </h3>

              <ul className="space-y-1">
                {dateEntries.map((entry) => {
                  const isSelected = entry.id === selectedId;

                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(entry)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={cn(
                          'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                          isSelected
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-transparent hover:border-gray-200 hover:bg-gray-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'line-clamp-1 text-sm font-medium',
                              isSelected ? 'text-teal-900' : 'text-gray-900',
                            )}
                          >
                            {entry.title || previewLine(entry)}
                          </p>
                          {!entry.is_active && (
                            <span
                              title="Hidden from tenants"
                              className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
                            >
                              <EyeOff className="h-3 w-3" />
                              Hidden
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {previewLine(entry)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
