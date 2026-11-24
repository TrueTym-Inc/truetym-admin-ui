import type {
  CreateWhatsNewPayload,
  UpdateWhatsNewPayload,
  WhatsNewEntry,
} from '@/types/whats-new';
import { PRIMARY_API_BASE_URL } from '@/lib/endpoint';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/http-client';

const BASE_PATH = '/whats-new';

// What's New is served by the tenant backend, not the admin backend that
// apiClient is configured with, so every call overrides the base URL.
const REQUEST_CONFIG = { baseURL: PRIMARY_API_BASE_URL } as const;

export async function listWhatsNew(options?: {
  includeInactive?: boolean;
  search?: string;
}): Promise<WhatsNewEntry[]> {
  const params = new URLSearchParams();

  if (options?.includeInactive) params.set('includeInactive', 'true');

  const search = options?.search?.trim();
  if (search) params.set('search', search);

  const query = params.toString();
  const response = await getJson<WhatsNewEntry[]>(
    `${BASE_PATH}${query ? `?${query}` : ''}`,
    REQUEST_CONFIG,
  );

  // The backend answers an empty changelog with succeeded:true and data: [].
  return response.data ?? [];
}

export async function createWhatsNew(payload: CreateWhatsNewPayload): Promise<WhatsNewEntry> {
  const response = await postJson<WhatsNewEntry>(BASE_PATH, payload, REQUEST_CONFIG);
  return response.data;
}

export async function updateWhatsNew(
  id: string,
  payload: UpdateWhatsNewPayload,
): Promise<WhatsNewEntry> {
  const response = await patchJson<WhatsNewEntry>(`${BASE_PATH}/${id}`, payload, REQUEST_CONFIG);
  return response.data;
}

/** Hides the entry from tenants but keeps the content. */
export async function deactivateWhatsNew(id: string): Promise<WhatsNewEntry> {
  const response = await deleteJson<WhatsNewEntry>(`${BASE_PATH}/${id}`, REQUEST_CONFIG);
  return response.data;
}

export async function deleteWhatsNewPermanently(id: string): Promise<void> {
  await deleteJson<{ id: string }>(`${BASE_PATH}/${id}/hard`, REQUEST_CONFIG);
}
