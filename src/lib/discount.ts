import { getHeaders } from '@/lib/api';
import { API_BASE_URL } from '@/lib/endpoint';

export type OrgModeFilter = 'all' | 'auto' | 'manual';

// ─────────────────────────────────────────────────────────────
// DISCOUNT / REFERRAL — admin authoring & control
// ─────────────────────────────────────────────────────────────

export async function createDiscount(payload: {
  code?: string;
  title: string;
  description?: string;
  discountValue: number;
  validFrom: number;
  validTo?: number;
  defaultAvailmentMonths?: number;
  appliesToSeatAdditions?: boolean;
  maxRedemptions?: number;
  discountScope?: 'all' | 'auto_recurring' | 'manual_prorate';
}) {
  try {
    const url = `${API_BASE_URL}/admin/discounts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('createDiscount error:', errorMessage);
    throw new Error(`Failed to create discount: ${errorMessage}`);
  }
}

export async function listDiscounts() {
  try {
    const url = `${API_BASE_URL}/admin/discounts`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('listDiscounts error:', errorMessage);
    throw new Error(`Failed to fetch discounts: ${errorMessage}`);
  }
}

export async function deactivateDiscount(id: string) {
  try {
    const url = `${API_BASE_URL}/admin/discounts/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('deactivateDiscount error:', errorMessage);
    throw new Error(`Failed to deactivate discount: ${errorMessage}`);
  }
}

export async function assignDiscount(payload: {
  discountMasterId: string;
  organisationId: string;
  availmentMonths?: number;
}) {
  try {
    const url = `${API_BASE_URL}/admin/discounts/assign`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('assignDiscount error:', errorMessage);
    throw new Error(`Failed to assign discount: ${errorMessage}`);
  }
}

export async function cancelOrgDiscount(orgDiscountId: string) {
  try {
    const url = `${API_BASE_URL}/admin/discounts/cancel/${orgDiscountId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('cancelOrgDiscount error:', errorMessage);
    throw new Error(`Failed to cancel org discount: ${errorMessage}`);
  }
}

// List discounts assigned to a specific org (for audit)
export async function listOrgDiscounts(organisationId: string) {
  try {
    const url = `${API_BASE_URL}/admin/discounts/org/${organisationId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('listOrgDiscounts error:', errorMessage);
    throw new Error(`Failed to fetch org discounts: ${errorMessage}`);
  }
}

export async function listDiscountOrgs(discountMasterId: string) {
  const url = `${API_BASE_URL}/admin/discounts/${discountMasterId}/orgs`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

export async function searchAssignableOrgs(q: string, mode: OrgModeFilter = 'all') {
  const params = new URLSearchParams({ q, mode });
  const url = `${API_BASE_URL}/admin/discounts/assignable-orgs?${params.toString()}`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

export async function assignDiscountToOrgs(payload: {
  discountMasterId: string;
  organisationIds: string[];
  availmentMonths?: number;
}) {
  try {
    const url = `${API_BASE_URL}/admin/discounts/assign-bulk`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('assignDiscountToOrgs error:', errorMessage);
    throw new Error(`Failed to assign discount: ${errorMessage}`);
  }
}
