'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Save, Trash2, X } from 'lucide-react';

import type { WhatsNewEntry } from '@/types/whats-new';
import { cn } from '@/lib/utils';
import { formatEntryDate } from '@/components/admin-panel/WhatsNewList';
import RichTextEditor from '@/components/common/RichTextEditor';

export type WhatsNewFormValues = {
  date: string;
  title: string;
  contentHtml: string;
  isActive: boolean;
  sortOrder: number;
};

type WhatsNewEditorPanelProps = {
  /** The entry being edited, or null when composing a new one. */
  entry: WhatsNewEntry | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (values: WhatsNewFormValues) => void;
  onCancel: () => void;
  onDelete: () => void;
};

function todayAsInputValue(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toFormValues(entry: WhatsNewEntry | null): WhatsNewFormValues {
  if (!entry) {
    return {
      date: todayAsInputValue(),
      title: '',
      contentHtml: '',
      isActive: true,
      sortOrder: 0,
    };
  }

  return {
    date: entry.date.split('T')[0],
    title: entry.title ?? '',
    // Entries written before the editor existed only have plain text; show it
    // as a paragraph so they can be edited rather than retyped.
    contentHtml:
      entry.content_html ??
      entry.description
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${escapeHtml(line.replace(/^•\s*/, ''))}</p>`)
        .join(''),
    isActive: entry.is_active,
    sortOrder: entry.sort_order,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function WhatsNewEditorPanel({
  entry,
  isSaving,
  isDeleting,
  onSave,
  onCancel,
  onDelete,
}: Readonly<WhatsNewEditorPanelProps>) {
  const documentKey = entry?.id ?? 'new';

  const [values, setValues] = useState<WhatsNewFormValues>(() => toFormValues(entry));
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState(documentKey);

  // Selecting a different entry (or starting a new one) reloads the form.
  //
  // This runs during render, not in an effect, on purpose. An effect would let
  // one render through carrying the previous entry's values, and the editor
  // below would load *those* — the entry you clicked would show the content of
  // the one you came from.
  if (loadedKey !== documentKey) {
    setLoadedKey(documentKey);
    setValues(toFormValues(entry));
    setError(null);
  }

  const update = <K extends keyof WhatsNewFormValues>(key: K, value: WhatsNewFormValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!values.date) {
      setError('Pick a date for this update.');
      return;
    }

    if (!values.contentHtml.trim()) {
      setError('Write the update content before saving.');
      return;
    }

    setError(null);
    onSave(values);
  };

  const isBusy = isSaving || isDeleting;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {entry ? 'Edit update' : 'New update'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {entry
              ? `Published ${formatEntryDate(entry.date)} · last edited ${new Date(
                  entry.updated_at,
                ).toLocaleString('en-GB')}`
              : 'Appears on every tenant’s What’s New page once saved and active.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {entry && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {entry ? 'Close' : 'Clear'}
          </button>

          <button
            type="submit"
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {entry ? 'Save changes' : 'Publish update'}
          </button>
        </div>
      </div>

      {/* Meta fields */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-[11rem_1fr_7rem]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">Date</span>
          <input
            type="date"
            required
            value={values.date}
            onChange={(event) => update('date', event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30 focus:outline-none"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
            Title <span className="font-normal normal-case">(optional)</span>
          </span>
          <input
            type="text"
            maxLength={255}
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="e.g. Quarterly and half-yearly billing"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className="text-xs font-semibold tracking-wide text-gray-600 uppercase"
            title="Lower numbers appear first among updates sharing a date"
          >
            Order
          </span>
          <input
            type="number"
            min={0}
            value={values.sortOrder}
            onChange={(event) => update('sortOrder', Number(event.target.value) || 0)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30 focus:outline-none"
          />
        </label>
      </div>

      {/* Editor */}
      <div className="flex max-h-[500px] min-h-[21rem] flex-1 flex-col gap-1.5">
        <span className="shrink-0 text-xs font-semibold tracking-wide text-gray-600 uppercase">
          Content
        </span>
        {/*
          Keyed per entry so each one gets a fresh editor, and with it a fresh
          undo history. Reusing the instance let Ctrl+Z in one entry restore
          the content of the entry edited before it.
        */}
        <RichTextEditor
          key={documentKey}
          className="min-h-0 flex-1"
          value={values.contentHtml}
          onChange={(html) => update('contentHtml', html)}
        />
      </div>

      {/* Visibility */}
      <button
        type="button"
        onClick={() => update('isActive', !values.isActive)}
        className={cn(
          'flex w-fit shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
          values.isActive
            ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
            : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
        )}
        aria-pressed={values.isActive}
      >
        {values.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        {values.isActive ? 'Visible to tenants' : 'Hidden from tenants'}
      </button>

      {error && (
        <p role="alert" className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Preview */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
          Tenant preview
        </span>
        <div className="flex h-[30rem] max-h-[35rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="shrink-0 border-b border-gray-200 bg-gray-50/80 px-5 py-3">
            <h3 className="text-sm font-bold tracking-wide text-gray-600">
              {values.date ? formatEntryDate(values.date) : '—'}
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {values.title && (
              <h4 className="mb-2 text-base font-semibold text-gray-900">{values.title}</h4>
            )}
            {values.contentHtml ? (
              // Content is sanitised server-side before it is stored, and this
              // preview renders what the author is typing right now.
              <div
                className="whats-new-content"
                dangerouslySetInnerHTML={{ __html: values.contentHtml }}
              />
            ) : (
              <p className="text-sm text-gray-400">Start typing above to see how this will look.</p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
