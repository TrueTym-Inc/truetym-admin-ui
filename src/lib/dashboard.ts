import { getHeaders } from '@/lib/api';
import { API_BASE_URL } from '@/lib/endpoint';

// ---- Response types (mirror DashboardInsightsService.getInsights) ----
export interface UpcomingItem {
  id: string;
  name: string;
  plan: string;
  mode: 'auto' | 'manual';
  kind: 'renewal' | 'trial_end';
  dueAt: number; // epoch seconds
  amount: number;
}
export interface ExpiredItem {
  id: string;
  name: string;
  plan: string;
  mode: 'auto' | 'manual';
  endedAt: number;
  amount: number;
}
export interface CancelledItem {
  id: string;
  name: string;
  plan: string;
  mode: 'auto' | 'manual';
  type: 'cancelled' | 'pending_cancel'; // 105 | 110
  endsAt: number;
  amount: number;
}
interface Bucket {
  count: number;
  amount: number;
}
export interface DashboardInsights {
  summary: { totalOrgs: number; totalSeats: number };
  statusCounts: {
    active: number;
    trial: number;
    expired: number;
    cancelled: number;
    payment_issue: number;
  };
  modeCounts: { auto: number; manual: number; offline: number };
  manualBreakdown: { manualPaid: number; manualTrialOrNone: number };
  payments: { collected: Bucket; pending: Bucket; failed: Bucket };
  paymentTrend: { month: string; collected: number; pending: number; failed: number }[];
  upcoming: { next7DaysAmount: number; next30DaysAmount: number; list: UpcomingItem[] };
  expired: { count: number; lostMrr: number; list: ExpiredItem[] };
  cancelled: { count: number; pendingCancelCount: number; lostMrr: number; list: CancelledItem[] };
  userTrend: { month: string; added: number; removed: number; net: number }[];
  recentPayments: { id: string; name: string; amount: number; status: string; createdAt: number }[];
  // non-fatal problems (e.g. payment stats failed) - dashboard still renders
  warnings?: string[];
}

// GET /dashboard/insights?months=6
export async function fetchDashboardInsights(months = 6): Promise<DashboardInsights> {
  try {
    const url = `${API_BASE_URL}/dashboard/insights?months=${months}`;
    const response = await fetch(url, { method: 'GET', headers: getHeaders() });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (!json.succeeded) throw new Error(json.message?.join(', ') || 'API error');
    return json.data as DashboardInsights;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('fetchDashboardInsights error:', errorMessage);
    throw new Error(`Failed to fetch dashboard insights: ${errorMessage}`);
  }
}
