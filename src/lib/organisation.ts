import { OrganizationListResponse } from '@/types/organisation';
import { getHeaders } from '@/lib/api'; // ← single source of truth for auth headers
import { API_BASE_URL } from '@/lib/endpoint';
import { patchJson } from '@/lib/http-client';

export interface ExtendPayload {
  days?: number;
  newDate?: number; // epoch seconds (overrides days)
}

// Fetch organizations list
export async function fetchOrganizations(
  pageNumber: number = 1,
  pageSize: number = 10,
  name: string = '',
  subscriptionPlan: string = '',
  trialStatus: string = '',
  fieldName: string = 'created_at',
  orderBy: string = 'ASC',
): Promise<OrganizationListResponse> {
  try {
    const params = new URLSearchParams({
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString(),
      name: name,
      subscriptionPlan: subscriptionPlan,
      trialStatus: trialStatus,
      fieldName: fieldName,
      orderBy: orderBy,
    });

    const url = `${API_BASE_URL}/organisations?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('fetchOrganizations error:', errorMessage);
    throw new Error(`Failed to fetch organizations: ${errorMessage}`);
  }
}

export const updateSubscriptionMode = (id: string, mode: 'auto' | 'manual') =>
  patchJson(`/organisations/${id}/subscription-mode`, {
    subscription_mode: mode,
  });

export const extendTrial = (id: string, payload: ExtendPayload) =>
  patchJson(`/organisations/${id}/extend-trial`, payload);

export const extendSubscription = (id: string, payload: ExtendPayload) =>
  patchJson(`/organisations/${id}/extend-subscription`, payload);
