'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RazorPaySubscriptionStatusEnum, RZP_STATUS_LABEL } from '@/constants/subscription';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Fingerprint,
  MinusCircle,
  MoreHorizontal,
  Pause,
  PauseCircle,
  RefreshCw,
  Search,
  TimerOff,
  Trash2,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { useSelector } from 'react-redux';

import { Organization } from '@/types/organisation';
import {
  ExtendPayload,
  extendSubscription,
  extendTrial,
  fetchOrganizations,
  updateSubscriptionMode,
} from '@/lib/organisation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUBSCRIPTION_PLANS = ['Basic', 'Core', 'Pro'];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'authenticated', label: 'Card Verified' },
  { value: 'pending', label: 'Pending Payment' },
  { value: 'halted', label: 'Halted' },
  { value: 'paused', label: 'Paused' },
  { value: 'pending_cancel', label: 'Pending Cancel' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' },
];

// Max page buttons shown in pagination (excluding prev/next)
const MAX_PAGE_BUTTONS = 7;

// Number of columns in the table — keep in sync with the <thead> (used for colSpan)
const TABLE_COLUMN_COUNT = 8;

// Subscription status set by the cron when a trial / plan runs out
const INACTIVE_SUB_STATUS = RazorPaySubscriptionStatusEnum.expired; // 107

// RZP states that deserve a warning dot on the status icon
const RZP_WARN_STATES: number[] = [
  RazorPaySubscriptionStatusEnum.pending,
  RazorPaySubscriptionStatusEnum.halted,
  RazorPaySubscriptionStatusEnum.failed,
  RazorPaySubscriptionStatusEnum.pending_cancel,
  RazorPaySubscriptionStatusEnum.authenticated,
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgStatus =
  | 'active'
  | 'trial'
  | 'expired'
  | 'inactive'
  | 'authenticated'
  | 'created'
  | 'pending'
  | 'halted'
  | 'paused'
  | 'pending_cancel'
  | 'scheduled';

interface NextPlan {
  planTitle: string | undefined;
  planAmount: number;
  effectiveAt: number;
}

interface OrgRow extends Organization {
  org_status: OrgStatus;
  /**
   * sub_status is the raw RZP numeric code.
   * null means no Razorpay subscription exists (manual / trial-only).
   */
  sub_status: number | null;
  subscription_type?: number;
  is_free_trial: number;
  razorpay_subscription_id: string | undefined;
  planTitle: string | undefined;
  planAmount: number;
  plan_is_historical?: boolean;
  total_licences: number;
  current_start: number;
  current_end: number;
  trial_end_at?: string | null;
  subscription_start_date: number;
  subscription_closed_date: number;
  subscription_mode: 'auto' | 'manual';
  nextPlan: NextPlan | null;
  pricing: { userCount: number; monthlyCost: number; yearlyCost: number };
  isSeatAvailable: boolean;
  onboarding_date?: number;
  /** Backend-computed fallback end date (used when trial_end_at / current_end are 0) */
  last_active_date?: number | null;
  last_active_source?: 'trial_end' | 'subscription_end' | null;
  [key: string]: any;
}

type PeriodKind = 'trial' | 'current' | 'trial_expired' | 'plan_expired';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Accepts unix seconds, unix ms, numeric strings and ISO strings. */
const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n <= 0) return null;
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value?: unknown): string => {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const fmtCurrency = (amount: number, cycle: number | null): string => {
  if (!amount) return '—';
  const suffix = cycle === 100 ? '/mo' : cycle === 101 ? '/yr' : '';
  return `₹${amount.toLocaleString('en-IN')}${suffix}`;
};

const truncate = (name?: string, max = 26) =>
  !name ? '—' : name.length > max ? `${name.slice(0, max)}…` : name;

/**
 * Which dates drive the Start / End columns.
 *
 *  - Free trial (is_free_trial = 1)               → org_subscription created_at (onboarded) → trial_end_at
 *  - Active (is_free_trial = 0, has sub id)       → current_start → current_end
 *  - Status 107 + subscription_id (plan expired)  → current_start → current_end
 *  - Status 107, no subscription_id (trial expired;
 *    cron set status null → 107, is_free_trial → 0) → org_subscription created_at (onboarded) → trial_end_at
 */
function resolvePeriod(org: OrgRow): { kind: PeriodKind; start: unknown; end: unknown } {
  const isFreeTrial = org.is_free_trial === 1 || (org.is_free_trial as any) === true;
  const hasSubscription = Boolean(org.subscription_id || org.razorpay_subscription_id);
  const isInactive =
    Number(org.sub_status) === INACTIVE_SUB_STATUS ||
    org.org_status === 'inactive' ||
    org.org_status === 'expired';
  const trialStart = firstDate(org.created_at, org.onboarding_date);

  // Legacy orgs (no org_subscription row) come back with trial_end_at / current_end = 0;
  // the backend still computes their real end date into last_active_date.
  const lastActive = org.last_active_date;
  const trialEnd = firstDate(
    org.trial_end_at,
    org.last_active_source === 'trial_end' ? lastActive : null,
  );
  const currentEnd = firstDate(
    org.current_end,
    org.last_active_source === 'subscription_end' ? lastActive : null,
  );

  if (isInactive) {
    return hasSubscription
      ? {
          kind: 'plan_expired',
          start: firstDate(org.current_start, org.subscription_start_date),
          end: currentEnd ?? lastActive,
        }
      : { kind: 'trial_expired', start: trialStart, end: trialEnd ?? lastActive };
  }

  if (isFreeTrial) {
    return { kind: 'trial', start: trialStart, end: trialEnd };
  }

  return { kind: 'current', start: org.current_start, end: currentEnd };
}

/** Returns the first value that parses to a real date (skips null, '', 0). */
function firstDate(...values: unknown[]): unknown {
  return values.find((v) => toDate(v) !== null) ?? null;
}

// ---------------------------------------------------------------------------
// resolveOrgState — reads authoritative fields from backend response
// ---------------------------------------------------------------------------
function resolveOrgState(org: OrgRow) {
  const orgStatus = (org.org_status ?? 'inactive') as OrgStatus;

  // sub_status is the raw RZP numeric code (null = no RZP sub)
  const rzpStatus: number | null =
    org.sub_status !== null && org.sub_status !== undefined ? Number(org.sub_status) : null;

  const isFreeTrial = org.is_free_trial === 1 || (org.is_free_trial as any) === true;
  const hasRzp = rzpStatus !== null;
  const hasNextPlan = !!org.nextPlan?.planTitle;

  // ---- Mode-switch guard rules ----
  //
  // Switch to MANUAL is only allowed when:
  //   1. Status is 'trial' AND sub_status is null (pure free trial, no RZP sub), OR
  //   2. Status is 'expired'
  //
  // Switch to AUTO is only allowed when:
  //   sub_status is null (no Razorpay subscription linked)
  const canSwitchToManual =
    (orgStatus === 'trial' && rzpStatus === null) || orgStatus === 'expired';

  const canSwitchToAuto = rzpStatus === null;

  const currentMode = (org.subscription_mode ?? 'auto') as 'auto' | 'manual';
  const canToggleMode = currentMode === 'auto' ? canSwitchToManual : canSwitchToAuto;

  return {
    orgStatus,
    rzpStatus,
    isFreeTrial,
    hasRzp,
    hasNextPlan,
    currentMode,
    canToggleMode,

    // Action gates
    canExtendTrial: orgStatus === 'trial' || orgStatus === 'authenticated',
    // Allow extend subscription for active, pending_cancel, AND expired
    canExtendSubscription:
      orgStatus === 'active' || orgStatus === 'pending_cancel' || orgStatus === 'inactive',
  };
}

// ---------------------------------------------------------------------------
// STATUS_META — visual config for every possible org_status
// ---------------------------------------------------------------------------
const STATUS_META: Record<
  OrgStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  active: {
    label: 'Active',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-600/20',
  },
  trial: {
    label: 'Trial',
    icon: Clock3,
    className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-600/20',
  },
  authenticated: {
    label: 'Card Verified',
    icon: Fingerprint,
    className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-500/20',
  },
  pending: {
    label: 'Pending Payment',
    icon: AlertCircle,
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-500/20',
  },
  halted: {
    label: 'Halted',
    icon: AlertCircle,
    className: 'bg-red-50 text-red-600 ring-1 ring-red-500/20',
  },
  paused: {
    label: 'Paused',
    icon: PauseCircle,
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-400/20',
  },
  pending_cancel: {
    label: 'Cancelling',
    icon: Clock3,
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-400/20',
  },
  scheduled: {
    label: 'Scheduled',
    icon: CalendarCheck,
    className: 'bg-sky-50 text-sky-600 ring-1 ring-sky-500/20',
  },
  created: {
    label: 'Created',
    icon: Clock3,
    className: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300/50',
  },
  expired: {
    label: 'Expired',
    icon: XCircle,
    className: 'bg-red-50 text-red-600 ring-1 ring-red-500/20',
  },
  inactive: {
    label: 'Inactive',
    icon: MinusCircle,
    className: 'bg-gray-100 text-gray-500 ring-1 ring-gray-400/20',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Icon-only status with a hover / focus tooltip.
 * Tooltip opens to the LEFT so it is never clipped by the table's scroll container.
 */
function StatusIcon({
  status,
  periodKind,
  rzpStatus,
}: Readonly<{ status: OrgStatus; periodKind: PeriodKind; rzpStatus: number | null }>) {
  const meta = STATUS_META[status] ?? STATUS_META.inactive;

  let Icon = meta.icon;
  let title = meta.label;
  if (periodKind === 'trial_expired') {
    Icon = TimerOff;
    title = `${meta.label} · Trial expired`;
  } else if (periodKind === 'plan_expired') {
    title = `${meta.label} · Plan expired`;
  }

  const rzpLabel = rzpStatus !== null ? (RZP_STATUS_LABEL[rzpStatus] ?? `RZP ${rzpStatus}`) : null;
  const showWarnDot = rzpStatus !== null && RZP_WARN_STATES.includes(rzpStatus);
  const ariaLabel = rzpLabel ? `${title}. Razorpay: ${rzpLabel}` : title;

  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${meta.className}`}
      >
        <Icon className="h-4 w-4" />
        {showWarnDot && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
        )}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-1/2 right-full z-30 mr-2 -translate-y-1/2 rounded-md bg-black px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <span className="block font-medium">{title}</span>
        {rzpLabel && <span className="block text-white/80">Razorpay: {rzpLabel}</span>}
      </span>
    </span>
  );
}

function ModeBadge({ mode }: Readonly<{ mode: 'auto' | 'manual' }>) {
  const isAuto = mode === 'auto';
  return (
    <span
      title={isAuto ? 'Razorpay auto-billing' : 'Prepaid / manual invoice'}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        isAuto
          ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20'
          : 'bg-teal-50 text-teal-700 ring-1 ring-teal-600/20'
      }`}
    >
      {isAuto ? <Zap className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
      {isAuto ? 'Auto' : 'Manual'}
    </span>
  );
}

function SubscriptionDetail({
  org,
  periodKind,
}: Readonly<{ org: OrgRow; periodKind: PeriodKind }>) {
  const cycleLabel =
    org.subscription_type === 100 ? 'Monthly' : org.subscription_type === 101 ? 'Yearly' : null;
  const isHistorical = !!org.plan_is_historical;
  const priceLabel =
    org.planAmount > 0 ? fmtCurrency(org.planAmount, org?.subscription_type ?? 100) : null;

  // No plan ever purchased → it's (or was) a free trial
  if (!org.planTitle && (periodKind === 'trial' || periodKind === 'trial_expired')) {
    return (
      <span
        title={
          periodKind === 'trial'
            ? 'On free trial — no plan purchased yet'
            : 'Free trial ended — no plan purchased'
        }
        className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-black ring-1 ring-amber-500/20"
      >
        <Clock3 className="h-3 w-3 text-amber-600" />
        Free trial
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-medium text-black">{org.planTitle || '—'}</span>
        {isHistorical && (
          <span
            title="Organisation has no active subscription — showing the last plan it had"
            className="rounded bg-gray-100 px-1 py-px text-[10px] font-medium text-black"
          >
            Last plan
          </span>
        )}
      </div>
      {(cycleLabel || priceLabel) && (
        <div className="text-xs whitespace-nowrap text-black">
          {[cycleLabel, priceLabel].filter(Boolean).join(' · ')}
        </div>
      )}
      {org.nextPlan?.planTitle && (
        <div className="flex items-center gap-1 text-[11px] whitespace-nowrap text-indigo-700">
          <ArrowRight className="h-2.5 w-2.5" />
          Next: {org.nextPlan.planTitle}
          {org.nextPlan.effectiveAt > 0 && <span>· {fmtDate(org.nextPlan.effectiveAt)}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExtendDialog
// ---------------------------------------------------------------------------

interface ExtendState {
  org: OrgRow | null;
  kind: 'trial' | 'subscription';
}

function ExtendDialog({
  state,
  onClose,
  onSubmit,
  submitting,
}: Readonly<{
  state: ExtendState;
  onClose: () => void;
  onSubmit: (payload: ExtendPayload) => void;
  submitting: boolean;
}>) {
  const [mode, setMode] = useState<'days' | 'date'>('days');
  const [days, setDays] = useState<number>(15);
  const [date, setDate] = useState<string>('');

  const open = !!state.org;
  const isTrial = state.kind === 'trial';
  const currentEnd = state.org ? (isTrial ? state.org.trial_end_at : state.org.current_end) : null;

  const handleSubmit = () => {
    if (mode === 'date') {
      if (!date) return;
      onSubmit({ newDate: Math.floor(new Date(`${date}T23:59:59`).getTime() / 1000) });
    } else {
      onSubmit({ days: Number(days) || 0 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o: any) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend {isTrial ? 'trial' : 'subscription'}</DialogTitle>
          <DialogDescription>
            {state.org?.org_name} · current end{' '}
            <span className="font-medium text-black">{fmtDate(currentEnd)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="inline-flex rounded-md border p-0.5">
            {(['days', 'date'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  mode === m ? 'bg-black text-white' : 'text-black hover:bg-gray-100'
                }`}
              >
                {m === 'days' ? 'Add days' : 'Pick date'}
              </button>
            ))}
          </div>

          {mode === 'days' ? (
            <div className="space-y-2">
              <Label>Days to add</Label>
              <div className="flex gap-2">
                {[7, 15, 30, 90].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={days === d ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDays(d)}
                  >
                    +{d}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <p className="text-xs text-black">
                Added on top of the later of current end / today.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>New end date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pagination — numbered buttons with ellipsis
// ---------------------------------------------------------------------------

interface PaginationProps {
  pageNumber: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pagination({
  pageNumber,
  totalPages,
  pageSize,
  totalItems,
  startItem,
  endItem,
  onPageChange,
  onPageSizeChange,
}: Readonly<PaginationProps>) {
  /** Always shows first, last, current ± 2, with '…' gaps between. */
  const buildPageList = (): (number | '...')[] => {
    if (totalPages <= MAX_PAGE_BUTTONS) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const delta = 2;
    const left = pageNumber - delta;
    const right = pageNumber + delta;
    const pages: (number | '...')[] = [1];

    if (left > 2) pages.push('...');
    for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    pages.push(totalPages);

    return pages;
  };

  const pageList = buildPageList();
  const navBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-black transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-y-2 text-sm text-black">
      <span className="text-xs">
        Showing{' '}
        <span className="font-semibold">
          {startItem}–{endItem}
        </span>{' '}
        of <span className="font-semibold">{totalItems}</span> organizations
      </span>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">Rows:</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(pageNumber - 1)}
            disabled={pageNumber === 1}
            className={navBtn}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageList.map((page, idx) =>
            page === '...' ? (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={`ellipsis-${idx}`}
                className="inline-flex h-8 w-8 items-center justify-center text-black select-none"
              >
                …
              </span>
            ) : (
              <button
                type="button"
                key={page}
                onClick={() => onPageChange(page)}
                aria-current={page === pageNumber ? 'page' : undefined}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors ${
                  page === pageNumber
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-black hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(pageNumber + 1)}
            disabled={pageNumber >= totalPages}
            className={navBtn}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgTableRow
// ---------------------------------------------------------------------------

const TH =
  'sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-black uppercase';
const TD = 'px-3 py-2.5 align-middle text-sm text-black';

interface OrgTableRowProps {
  org: OrgRow;
  onExtend: (org: OrgRow, kind: 'trial' | 'subscription') => void;
  onToggleMode: (org: OrgRow) => void;
  modePending: boolean;
  isSuperAdmin: boolean;
  router: ReturnType<typeof useRouter>;
}

function OrgTableRow({
  org,
  onExtend,
  onToggleMode,
  modePending,
  isSuperAdmin,
  router,
}: Readonly<OrgTableRowProps>) {
  const state = resolveOrgState(org);
  const period = resolvePeriod(org);
  const mode = state.currentMode;
  const seatsUsed = org.pricing?.userCount ?? 0;
  const seatsTotal = org.total_licences > 0 ? org.total_licences : null;
  const overSeats = seatsTotal !== null && seatsUsed > seatsTotal;

  return (
    <tr className="border-b border-gray-100 transition-colors last:border-0 hover:bg-teal-50/40">
      {/* Organization + onboarded date */}
      <td className={TD}>
        <button
          type="button"
          title={org.website ? `${org.org_name}\n${org.website}` : org.org_name}
          onClick={() => router.push(`/employees?id=${org.id}`)}
          className="text-left font-semibold text-black hover:text-teal-700"
        >
          {truncate(org.org_name)}
        </button>
        <div className="text-xs whitespace-nowrap text-black">
          Onboarded {fmtDate(org.onboarding_date)}
        </div>
      </td>

      {/* Subscription */}
      <td className={TD}>
        <SubscriptionDetail org={org} periodKind={period.kind} />
      </td>

      {/* Billing mode */}
      <td className={TD}>
        <ModeBadge mode={mode} />
      </td>

      {/* Seats used / licensed */}
      <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
        <span className={overSeats ? 'font-semibold text-red-600' : 'font-medium'}>
          {seatsUsed}
        </span>
        <span>/{seatsTotal ?? '—'}</span>
      </td>

      {/* Period start / end */}
      <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(period.start)}</td>
      <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(period.end)}</td>

      {/* Status — icon only, details on hover */}
      <td className={`${TD} text-center`}>
        <StatusIcon status={state.orgStatus} periodKind={period.kind} rzpStatus={state.rzpStatus} />
      </td>

      {/* Actions */}
      <td className={`${TD} text-right`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Manage</DropdownMenuLabel>

            <DropdownMenuItem onClick={() => router.push(`/employees?id=${org.id}`)}>
              <Users className="mr-2 h-4 w-4" />
              View employees
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {state.canExtendTrial && (
              <DropdownMenuItem onClick={() => onExtend(org, 'trial')}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Extend trial
              </DropdownMenuItem>
            )}

            {state.canExtendSubscription && (
              <DropdownMenuItem onClick={() => onExtend(org, 'subscription')}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Extend subscription
              </DropdownMenuItem>
            )}

            {/* RZP-status-specific actions */}
            {typeof state.rzpStatus === 'number' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal">
                  Razorpay: {RZP_STATUS_LABEL[state.rzpStatus] ?? state.rzpStatus}
                </DropdownMenuLabel>

                {state.rzpStatus === RazorPaySubscriptionStatusEnum.authenticated && (
                  <DropdownMenuItem onClick={() => router.push(`/billing?id=${org.id}`)}>
                    <Fingerprint className="mr-2 h-4 w-4" />
                    Card verified — awaiting charge
                  </DropdownMenuItem>
                )}

                {[
                  RazorPaySubscriptionStatusEnum.pending,
                  RazorPaySubscriptionStatusEnum.failed,
                ].includes(state.rzpStatus) && (
                  <DropdownMenuItem onClick={() => router.push(`/billing?id=${org.id}`)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Review payment
                  </DropdownMenuItem>
                )}

                {state.rzpStatus === RazorPaySubscriptionStatusEnum.halted && (
                  <DropdownMenuItem onClick={() => router.push(`/billing?id=${org.id}`)}>
                    <Pause className="mr-2 h-4 w-4" />
                    Review halted billing
                  </DropdownMenuItem>
                )}

                {state.rzpStatus === RazorPaySubscriptionStatusEnum.paused && (
                  <DropdownMenuItem onClick={() => router.push(`/billing?id=${org.id}`)}>
                    <PauseCircle className="mr-2 h-4 w-4" />
                    View paused subscription
                  </DropdownMenuItem>
                )}

                {[
                  RazorPaySubscriptionStatusEnum.pending_cancel,
                  RazorPaySubscriptionStatusEnum.scheduled,
                ].includes(state.rzpStatus) && (
                  <DropdownMenuItem onClick={() => router.push(`/billing?id=${org.id}`)}>
                    <Clock3 className="mr-2 h-4 w-4" />
                    View scheduled change
                  </DropdownMenuItem>
                )}

                {state.rzpStatus === RazorPaySubscriptionStatusEnum.cancelled && (
                  <DropdownMenuItem disabled>
                    <XCircle className="mr-2 h-4 w-4" />
                    Subscription cancelled
                  </DropdownMenuItem>
                )}
              </>
            )}

            <DropdownMenuSeparator />

            {state.canToggleMode ? (
              <DropdownMenuItem disabled={modePending} onClick={() => onToggleMode(org)}>
                {mode === 'auto' ? (
                  <CreditCard className="mr-2 h-4 w-4" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Switch to {mode === 'auto' ? 'manual' : 'auto'}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled className="cursor-not-allowed">
                {mode === 'auto' ? (
                  <CreditCard className="mr-2 h-4 w-4 opacity-40" />
                ) : (
                  <Zap className="mr-2 h-4 w-4 opacity-40" />
                )}
                <span className="opacity-50">
                  Switch to {mode === 'auto' ? 'manual' : 'auto'} (unavailable)
                </span>
              </DropdownMenuItem>
            )}

            {isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-700"
                  onClick={() => router.push(`/offboarding?org_id=${org.id}`)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete organisation
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// FilterBar — search + plan + status selects
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filters: { name: string; subscriptionPlan: string; trialStatus: string };
  isFetching: boolean;
  onFilter: (key: 'name' | 'subscriptionPlan' | 'trialStatus', value: string) => void;
}

function FilterBar({ filters, isFetching, onFilter }: Readonly<FilterBarProps>) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-black/50" />
        <Input
          placeholder="Search organization…"
          value={filters.name}
          onChange={(e) => onFilter('name', e.target.value)}
          className="h-9 w-64 bg-white pl-8"
        />
      </div>

      <Select
        value={filters.subscriptionPlan || 'all'}
        onValueChange={(v) => onFilter('subscriptionPlan', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="h-9 w-36 bg-white">
          <SelectValue placeholder="All Plans" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Plans</SelectItem>
          {SUBSCRIPTION_PLANS.map((plan) => (
            <SelectItem key={plan} value={plan}>
              {plan}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.trialStatus} onValueChange={(v) => onFilter('trialStatus', v)}>
        <SelectTrigger className="h-9 w-44 bg-white">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFetching && <span className="ml-1 text-xs text-black">Refreshing…</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrganisationPage
// ---------------------------------------------------------------------------

export default function OrganisationPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({
    name: '',
    subscriptionPlan: '',
    trialStatus: 'all',
  });
  const [extendState, setExtendState] = useState<ExtendState>({ org: null, kind: 'trial' });

  const queryKey = ['organizations', pageNumber, pageSize, filters] as const;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetchOrganizations(
        pageNumber,
        pageSize,
        filters.name,
        filters.subscriptionPlan === '' ? '' : filters.subscriptionPlan,
        filters.trialStatus === 'all' ? '' : filters.trialStatus,
        'created_at',
        'DESC',
      );
      if (!res.succeeded && res.totalItems > 0) {
        throw new Error(res.message?.join(', ') || 'API error');
      }
      return {
        list: (res.data ?? []) as unknown as OrgRow[],
        totalItems: res.totalItems ?? 0,
      };
    },
  });

  const organizations = data?.list ?? [];
  const totalItems = data?.totalItems ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['organizations'] });

  const extendMut = useMutation({
    mutationFn: ({
      id,
      kind,
      payload,
    }: {
      id: string;
      kind: 'trial' | 'subscription';
      payload: ExtendPayload;
    }) => (kind === 'trial' ? extendTrial(id, payload) : extendSubscription(id, payload)),
    onSuccess: () => {
      setExtendState({ org: null, kind: 'trial' });
      invalidate();
    },
  });

  const modeMut = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: 'auto' | 'manual' }) =>
      updateSubscriptionMode(id, mode),
    onSuccess: invalidate,
  });

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((p) => ({ ...p, [key]: value }));
    setPageNumber(1);
  };

  const startItem = totalItems === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const endItem = Math.min(pageNumber * pageSize, totalItems);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center text-red-600">
          <p className="font-semibold">Error loading organizations</p>
          <p className="text-sm">{(error as Error)?.message}</p>
        </div>
      </div>
    );
  }

  return (
    // h-full fills <main> (which sits under the Navbar); the table scrolls inside its own box
    <div className="flex h-full min-w-0 flex-col p-5 md:p-6">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-black">Organizations</h1>
        <p className="text-sm text-black">Manage subscriptions, trials and billing mode</p>
      </div>

      {/* Filters */}
      <div className="shrink-0">
        <FilterBar filters={filters} isFetching={isFetching} onFilter={setFilter} />
      </div>

      {/* Table — single scroll container (both axes) so the sticky header works */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${TH} min-w-48`}>Organization</th>
                <th className={`${TH} min-w-36`}>Subscription</th>
                <th className={TH}>Mode</th>
                <th className={`${TH} text-right`}>Seats</th>
                <th className={TH}>Start</th>
                <th className={TH}>End</th>
                <th className={`${TH} text-center`}>Status</th>
                <th className={`${TH} w-12`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-black">
                      <RefreshCw className="h-5 w-5 animate-spin text-teal-600" />
                      <span className="text-sm">Loading organizations…</span>
                    </div>
                  </td>
                </tr>
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-1.5 text-black">
                      <Search className="h-5 w-5 text-black/40" />
                      <span className="text-sm font-medium">
                        No organizations match the current filters
                      </span>
                      <span className="text-xs">Try adjusting your search or status filter</span>
                    </div>
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <OrgTableRow
                    key={org.id}
                    org={org}
                    onExtend={(o, kind) => setExtendState({ org: o, kind })}
                    onToggleMode={(o) => {
                      const st = resolveOrgState(o);
                      modeMut.mutate({
                        id: o.id,
                        mode: st.currentMode === 'auto' ? 'manual' : 'auto',
                      });
                    }}
                    modePending={modeMut.isPending}
                    isSuperAdmin={isSuperAdmin}
                    router={router}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="shrink-0">
          <Pagination
            pageNumber={pageNumber}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            onPageChange={setPageNumber}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPageNumber(1);
            }}
          />
        </div>
      )}

      {/* Extend dialog */}
      <ExtendDialog
        state={extendState}
        submitting={extendMut.isPending}
        onClose={() => setExtendState({ org: null, kind: 'trial' })}
        onSubmit={(payload) =>
          extendState.org &&
          extendMut.mutate({ id: extendState.org.id, kind: extendState.kind, payload })
        }
      />
    </div>
  );
}
