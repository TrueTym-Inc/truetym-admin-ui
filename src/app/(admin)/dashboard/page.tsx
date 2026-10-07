'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchDashboardInsights } from '@/lib/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const fmtDate = (s?: number) =>
  s && s > 0
    ? new Date(s * 1000).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

// whole days from now until a timestamp (negative = past)
const daysFromNow = (s: number) => Math.ceil((s * 1000 - Date.now()) / 86_400_000);

const PAYMENT_BADGE: Record<string, string> = {
  captured: 'bg-emerald-50 text-emerald-700',
  paid: 'bg-emerald-50 text-emerald-700',
  success: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  created: 'bg-amber-50 text-amber-700',
  authorized: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-600',
};

// Reusable KPI tile
function Kpi({
  title,
  value,
  sub,
  icon: Icon,
  tone,
}: Readonly<{ title: string; value: string; sub: string; icon: React.ElementType; tone: string }>) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{sub}</p>
        </div>
        <div className={`rounded-lg p-2 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [months, setMonths] = useState('6');

  // Auth check on mount (unchanged from previous dashboard)
  useEffect(() => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) router.push('/login');
    else setIsAuthenticated(true);
    setIsAuthLoading(false);
  }, [router]);

  // Single request feeds the whole page
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard-insights', months],
    queryFn: () => fetchDashboardInsights(Number(months)),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('loginUserId');
      router.push('/login');
    }
  };

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  // Chart palettes
  const modeData = data
    ? [
        { name: 'Auto (Razorpay)', value: data.modeCounts.auto, color: '#8b5cf6' },
        {
          name: 'Manual – trial/none',
          value: data.manualBreakdown.manualTrialOrNone,
          color: '#5eead4',
        },
        { name: 'Manual – offline paid', value: data.manualBreakdown.manualPaid, color: '#0d9488' },
      ].filter((d) => d.value > 0)
    : [];

  const statusData = data
    ? [
        { name: 'Active', value: data.statusCounts.active, color: '#10b981' },
        { name: 'Trial', value: data.statusCounts.trial, color: '#f59e0b' },
        { name: 'Payment issue', value: data.statusCounts.payment_issue, color: '#f97316' },
        { name: 'Cancelled', value: data.statusCounts.cancelled, color: '#64748b' },
        { name: 'Expired', value: data.statusCounts.expired, color: '#ef4444' },
      ]
    : [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Dashboard Overview</h1>
          <p className="mt-1 text-gray-500">
            Payments, subscriptions and user trends across all customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => refetch()}
            className="rounded-lg border p-2 text-gray-600 hover:bg-gray-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error)?.message}
        </div>
      )}

      {isLoading || !data ? (
        <div className="py-24 text-center text-gray-400">Loading dashboard…</div>
      ) : (
        <>
          {/* Non-fatal backend warnings (e.g. payment query failed) */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {data.warnings.join(' · ')}
            </div>
          )}

          {/* ---------- KPI row: payments ---------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              title="Collected"
              value={inr(data.payments.collected.amount)}
              sub={`${data.payments.collected.count} payments`}
              icon={CheckCircle2}
              tone="bg-emerald-50 text-emerald-600"
            />
            <Kpi
              title="Pending"
              value={inr(data.payments.pending.amount)}
              sub={`${data.payments.pending.count} awaiting payment`}
              icon={Clock3}
              tone="bg-amber-50 text-amber-600"
            />
            <Kpi
              title="Failed / Cancelled"
              value={inr(data.payments.failed.amount)}
              sub={`${data.payments.failed.count} payments`}
              icon={XCircle}
              tone="bg-red-50 text-red-600"
            />
            <Kpi
              title="Upcoming (7 days)"
              value={inr(data.upcoming.next7DaysAmount)}
              sub={`${inr(data.upcoming.next30DaysAmount)} in 30 days`}
              icon={CalendarClock}
              tone="bg-blue-50 text-blue-600"
            />
            <Kpi
              title="Expired customers"
              value={String(data.expired.count)}
              sub={`${inr(data.expired.lostMrr)} / cycle at risk`}
              icon={AlertTriangle}
              tone="bg-orange-50 text-orange-600"
            />
          </div>

          {/* ---------- KPI row: customers ---------- */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi
              title="Total customers"
              value={String(data.summary.totalOrgs)}
              sub={`${data.summary.totalSeats} seats`}
              icon={Users}
              tone="bg-teal-50 text-teal-600"
            />
            <Kpi
              title="Auto billing"
              value={String(data.modeCounts.auto)}
              sub="Razorpay recurring"
              icon={Zap}
              tone="bg-violet-50 text-violet-600"
            />
            <Kpi
              title="Manual billing"
              value={String(data.modeCounts.manual)}
              sub="Prepaid / invoice"
              icon={CreditCard}
              tone="bg-teal-50 text-teal-600"
            />
            <Kpi
              title="Offline paid"
              value={String(data.modeCounts.offline)}
              sub="Manual + active plan"
              icon={Banknote}
              tone="bg-emerald-50 text-emerald-600"
            />
            <Kpi
              title="Cancelled"
              value={String(data.cancelled.count)}
              sub={`${data.cancelled.pendingCancelCount} cancelling at period end`}
              icon={XCircle}
              tone="bg-slate-100 text-slate-600"
            />
            <Kpi
              title="On trial"
              value={String(data.statusCounts.trial)}
              sub={`${data.statusCounts.payment_issue} with payment issues`}
              icon={Clock3}
              tone="bg-amber-50 text-amber-600"
            />
          </div>

          {/* ---------- Charts: payments + users ---------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payments trend</CardTitle>
                <p className="text-sm text-gray-500">Collected vs pending vs failed per month</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={data.paymentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Legend />
                    <Bar
                      dataKey="collected"
                      name="Collected"
                      fill="#14b8a6"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" fill="#f87171" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User additions vs removals</CardTitle>
                <p className="text-sm text-gray-500">
                  Seats added and removed across all customers
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={270}>
                  <AreaChart data={data.userTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="added"
                      name="Added"
                      stroke="#14b8a6"
                      fill="#5eead4"
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="removed"
                      name="Removed"
                      stroke="#ef4444"
                      fill="#fca5a5"
                      fillOpacity={0.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-gray-500">
                  Net this period:{' '}
                  <span className="font-semibold text-gray-800">
                    {data.userTrend.reduce((s, t) => s + t.net, 0) >= 0 ? '+' : ''}
                    {data.userTrend.reduce((s, t) => s + t.net, 0)}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ---------- Donuts: billing mode + status ---------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[
              { title: 'Billing mode', sub: 'Auto vs manual vs offline', rows: modeData },
              { title: 'Customer status', sub: 'Lifecycle of all organisations', rows: statusData },
            ].map((chart) => (
              <Card key={chart.title}>
                <CardHeader>
                  <CardTitle>{chart.title}</CardTitle>
                  <p className="text-sm text-gray-500">{chart.sub}</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={chart.rows}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {chart.rows.map((r) => (
                          <Cell key={r.name} fill={r.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ---------- Lists: upcoming, expired, recent payments ---------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming (next 30 days)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.upcoming.list.length === 0 && (
                  <p className="text-sm text-gray-400">Nothing due.</p>
                )}
                {data.upcoming.list.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => router.push(`/client-details/billing?id=${u.id}`)}
                    className="flex w-full items-center justify-between text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">
                        {u.kind === 'trial_end' ? 'Trial ends' : 'Renews'} {fmtDate(u.dueAt)} ·{' '}
                        {u.mode}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700">
                      {daysFromNow(u.dueAt)}d{u.kind === 'renewal' ? ` · ${inr(u.amount)}` : ''}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expired customers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.expired.list.length === 0 && (
                  <p className="text-sm text-gray-400">No expired customers.</p>
                )}
                {data.expired.list.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => router.push(`/client-details/billing?id=${e.id}`)}
                    className="flex w-full items-center justify-between text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.name}</p>
                      <p className="text-xs text-gray-500">
                        Ended {fmtDate(e.endedAt)} · {e.plan}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-red-600">{inr(e.amount)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cancelled customers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.cancelled.list.length === 0 && (
                  <p className="text-sm text-gray-400">No cancellations.</p>
                )}
                {data.cancelled.list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/client-details/billing?id=${c.id}`)}
                    className="flex w-full items-center justify-between text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {c.type === 'pending_cancel' ? 'Cancels' : 'Cancelled'} {fmtDate(c.endsAt)}{' '}
                        · {c.plan}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.type === 'pending_cancel'
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.type === 'pending_cancel' ? 'Pending' : 'Cancelled'}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentPayments.length === 0 && (
                  <p className="text-sm text-gray-400">No payments yet.</p>
                )}
                {data.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name || '—'}</p>
                      <p className="text-xs text-gray-500">{fmtDate(p.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{inr(p.amount)}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          PAYMENT_BADGE[String(p.status).toLowerCase()] ??
                          'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
