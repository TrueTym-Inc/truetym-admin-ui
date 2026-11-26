/** A single changelog entry as the backend stores it. */
export type WhatsNewEntry = {
  id: string;
  /** MySQL DATE, serialised as "YYYY-MM-DD". */
  date: string;
  title: string | null;
  /** Sanitised HTML authored in the editor. Null for pre-editor rows. */
  content_html: string | null;
  /** Plain-text rendering, kept in step with content_html by the backend. */
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreateWhatsNewPayload = {
  date: string;
  title?: string;
  contentHtml: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdateWhatsNewPayload = Partial<CreateWhatsNewPayload>;
