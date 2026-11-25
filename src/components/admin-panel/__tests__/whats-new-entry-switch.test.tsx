import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { WhatsNewEntry } from '@/types/whats-new';
import WhatsNewEditorPanel, {
  type WhatsNewFormValues,
} from '@/components/admin-panel/WhatsNewEditorPanel';

const makeEntry = (
  id: string,
  title: string | null,
  html: string | null,
  description = 'plain text',
): WhatsNewEntry => ({
  id,
  date: '2026-11-24',
  title,
  content_html: html,
  description,
  is_active: true,
  sort_order: 0,
  created_at: '2026-11-24T00:00:00.000Z',
  updated_at: '2026-11-24T00:00:00.000Z',
});

const ENTRY_A = makeEntry('aaaaaaaaaaaaaaaaaaaaaaa1', 'Entry A', '<p>CONTENT FROM ENTRY A</p>');
const ENTRY_B = makeEntry('bbbbbbbbbbbbbbbbbbbbbbb2', 'Entry B', '<p>CONTENT FROM ENTRY B</p>');
const LEGACY = makeEntry('ccccccccccccccccccccccc3', null, null, 'LEGACY PLAIN TEXT ENTRY');

/** The editable surface TipTap owns, as opposed to the read-only preview. */
function surface(): HTMLElement {
  const node = document.querySelector('.ProseMirror');
  if (!node) throw new Error('editor surface not mounted');
  return node as HTMLElement;
}

function renderPanel(
  entry: WhatsNewEntry | null,
  onSave: (values: WhatsNewFormValues) => void = () => undefined,
) {
  return (
    <WhatsNewEditorPanel
      entry={entry}
      isSaving={false}
      isDeleting={false}
      onSave={onSave}
      onCancel={() => undefined}
      onDelete={() => undefined}
    />
  );
}

describe('WhatsNewEditorPanel', () => {
  it('loads the selected entry content', async () => {
    render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));
  });

  // The reported bug: the meta fields followed the new selection but the
  // editor body kept showing the entry you came from.
  it('loads the new entry content when the selection changes', async () => {
    const { rerender } = render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(ENTRY_B));

    await waitFor(() => expect(screen.getByDisplayValue('Entry B')).toBeInTheDocument());
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY B'));
    expect(surface()).not.toHaveTextContent('CONTENT FROM ENTRY A');
  });

  it('switches back to the first entry correctly', async () => {
    const { rerender } = render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(ENTRY_B));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY B'));

    rerender(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));
    expect(surface()).not.toHaveTextContent('CONTENT FROM ENTRY B');
  });

  it('renders a legacy plain-text entry as editable paragraphs', async () => {
    const { rerender } = render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(LEGACY));
    await waitFor(() => expect(surface()).toHaveTextContent('LEGACY PLAIN TEXT ENTRY'));
  });

  it('clears the editor when starting a new entry', async () => {
    const { rerender } = render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(null));
    await waitFor(() => expect(surface()).not.toHaveTextContent('CONTENT FROM ENTRY A'));
  });

  // Undo history used to carry over, so Ctrl+Z while editing B restored A's
  // content — and onUpdate then wrote it into the form being saved.
  it('does not let undo pull the previous entry back', async () => {
    const { rerender } = render(renderPanel(ENTRY_A));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(ENTRY_B));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY B'));

    fireEvent.keyDown(surface(), { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(surface(), { key: 'z', code: 'KeyZ', metaKey: true });

    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY B'));
    expect(surface()).not.toHaveTextContent('CONTENT FROM ENTRY A');
  });

  it('saves the content of the entry currently shown', async () => {
    const onSave = jest.fn();
    const { rerender } = render(renderPanel(ENTRY_A, onSave));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY A'));

    rerender(renderPanel(ENTRY_B, onSave));
    await waitFor(() => expect(surface()).toHaveTextContent('CONTENT FROM ENTRY B'));

    await userEvent.setup().click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const submitted = onSave.mock.calls[0][0] as WhatsNewFormValues;
    expect(submitted.title).toBe('Entry B');
    expect(submitted.contentHtml).toContain('CONTENT FROM ENTRY B');
    expect(submitted.contentHtml).not.toContain('CONTENT FROM ENTRY A');
  });
});
