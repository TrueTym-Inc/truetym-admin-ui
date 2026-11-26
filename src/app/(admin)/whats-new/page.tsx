'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import type { WhatsNewEntry } from '@/types/whats-new';
import {
  createWhatsNew,
  deleteWhatsNewPermanently,
  listWhatsNew,
  updateWhatsNew,
} from '@/lib/whats-new';
import WhatsNewEditorPanel, {
  type WhatsNewFormValues,
} from '@/components/admin-panel/WhatsNewEditorPanel';
import WhatsNewList from '@/components/admin-panel/WhatsNewList';
import ConfirmationModal from '@/components/common/ConfirmationModal';

const QUERY_KEY = 'whats-new-admin';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function WhatsNewAdminPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WhatsNewEntry | null>(null);

  // Keep typing responsive without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, includeInactive, debouncedSearch],
    queryFn: () => listWhatsNew({ includeInactive, search: debouncedSearch }),
  });

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: createWhatsNew,
    onSuccess: async (entry) => {
      toast.success('Update published.');
      await invalidate();
      setIsComposing(false);
      setSelectedId(entry.id);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not publish the update.')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: WhatsNewFormValues }) =>
      updateWhatsNew(id, {
        date: values.date,
        title: values.title,
        contentHtml: values.contentHtml,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      }),
    onSuccess: async () => {
      toast.success('Update saved.');
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the update.')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWhatsNewPermanently,
    onSuccess: async () => {
      toast.success('Update deleted.');
      await invalidate();
      setSelectedId(null);
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Could not delete the update.'));
      setPendingDelete(null);
    },
  });

  const handleSave = (values: WhatsNewFormValues) => {
    const payload = {
      date: values.date,
      title: values.title,
      contentHtml: values.contentHtml,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    if (selectedEntry) {
      updateMutation.mutate({ id: selectedEntry.id, values });
      return;
    }

    createMutation.mutate(payload);
  };

  const startComposing = () => {
    setSelectedId(null);
    setIsComposing(true);
  };

  const activeCount = entries.filter((entry) => entry.is_active).length;
  const isPanelOpen = isComposing || Boolean(selectedEntry);

  return (
    <div className="flex h-[calc(150vh-4rem)] flex-col gap-4 overflow-hidden p-6">
      {/* Page header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">What&apos;s New</h1>
            <p className="text-xs text-gray-500">
              Publish product updates to every tenant&apos;s What&apos;s New page.
              {!isLoading && (
                <span className="ml-1 text-gray-400">
                  {entries.length} total · {activeCount} visible
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startComposing}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          New update
        </button>
      </header>

      {/* List + editor */}
      <div className="flex min-h-0 flex-1 gap-4">
        <WhatsNewList
          entries={entries}
          selectedId={selectedId}
          isLoading={isLoading}
          search={search}
          includeInactive={includeInactive}
          onSearchChange={setSearch}
          onIncludeInactiveChange={setIncludeInactive}
          onSelect={(entry) => {
            setIsComposing(false);
            setSelectedId(entry.id);
          }}
        />

        {isPanelOpen ? (
          <WhatsNewEditorPanel
            entry={selectedEntry}
            isSaving={createMutation.isPending || updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
            onSave={handleSave}
            onCancel={() => {
              setIsComposing(false);
              setSelectedId(null);
            }}
            onDelete={() => selectedEntry && setPendingDelete(selectedEntry)}
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white/60 p-10 text-center">
            <Sparkles className="h-8 w-8 text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Pick an update to edit, or write a new one
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Formatting you apply here is what tenants see on their dashboard.
              </p>
            </div>
            <button
              type="button"
              onClick={startComposing}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-100"
            >
              <Plus className="h-4 w-4" />
              New update
            </button>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmationModal
          title="Delete this update?"
          message={`"${
            pendingDelete.title || pendingDelete.description.split('\n')[0]
          }" will be removed permanently. To hide it from tenants instead, switch it to Hidden and save.`}
          confirmText="Delete permanently"
          isLoading={deleteMutation.isPending}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(pendingDelete.id).catch(() => undefined);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
