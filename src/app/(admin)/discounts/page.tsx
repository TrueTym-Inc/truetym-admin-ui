'use client';

import React, { useEffect, useState } from 'react';
import { Check, Info, Plus, Search, Tag, Trash2, X } from 'lucide-react';

import {
  assignDiscountToOrgs,
  cancelOrgDiscount,
  createDiscount,
  deactivateDiscount,
  listDiscountOrgs,
  listDiscounts,
  searchAssignableOrgs,
  type OrgModeFilter,
} from '@/lib/discount';

interface DiscountRow {
  id: string;
  code: string | null;
  title: string;
  discount_value: number;
  valid_from: number;
  valid_to: number | null;
  default_availment_months: number | null;
  applies_to_seat_additions: number;
  max_redemptions: number | null;
  redemption_count: number;
  is_active: number;
}

interface OrgResult {
  id: string;
  org_name: string;
  subscription_mode?: string | null; // 'auto' | 'manual'
}

// An org that currently holds the discount being managed.
interface AssignedOrg {
  org_discount_id: string; // id used for cancelling the link
  organisation_id: string;
  org_name: string;
  subscription_mode?: string | null; // 'auto' | 'manual'
  activated_at: number;
  expires_at: number | null;
}

const toEpoch = (d: string) => Math.floor(new Date(`${d}T00:00:00`).getTime() / 1000);
const fmtDate = (s: number | null) =>
  !s
    ? 'No expiry'
    : new Date(s * 1000).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

const asArray = <T,>(res: any): T[] => (Array.isArray(res) ? res : (res?.data ?? []));

// ─────────────────────────────────────────────────────────────
// Help text for the (i) buttons — one entry per input field.
// Kept in one place so wording is easy to review / change.
// ─────────────────────────────────────────────────────────────
const INFO = {
  scope:
    'Controls which charges this discount reduces. "All charges" applies to auto-recurring Razorpay billing AND manual bills / prorated charges. "Auto recurring only" also creates a Razorpay offer. "Manual bills + prorate only" never touches recurring subscription billing.',
  code: 'Optional referral / coupon code (e.g. TRUETYM20). Must be unique. Leave blank for discounts that are assigned by admins only.',
  title:
    'Internal name shown in this admin list (e.g. "Volume discount — Pro"). Also used as the Razorpay offer title (first 30 characters).',
  description:
    'Optional internal note explaining why this discount exists or who it is meant for. Not shown to customers.',
  discountValue:
    'Percentage taken off the charge, from 1 to 100. Example: 20 means the organisation pays 80% of the normal amount.',
  validFrom:
    'First day this discount can be assigned to an organisation. Before this date the rule exists but cannot be used.',
  validTo:
    'Last day this discount can be assigned. Leave blank for no expiry. An organisation’s discount window is never allowed to run past this date.',
  availmentMonths:
    'How many months an organisation enjoys the discount after it is assigned (e.g. 3 = three months). Leave blank to follow the validity end date instead. Can be overridden per assignment.',
  maxRedemptions:
    'Maximum number of organisations that can hold this discount at the same time. Removing a discount from an org frees up a slot. Leave blank for unlimited.',
  seatAdd:
    'If ticked, the discount also applies when an organisation adds seats mid-cycle. If unticked, added seats are billed at full price.',
  orgSearch:
    'Search organisations by name. Organisations you tick move to the "Selected" section at the top so they stay visible while you keep searching.',
  modeFilter:
    'Narrow the lists by how the organisation is billed. Auto = auto-recurring subscription billing. Manual = manually raised bills. All shows both. The filter applies to the search results and to the "Currently assigned" list; organisations you have already selected stay selected when you switch.',
  assignMonths:
    'Optional. Overrides the discount’s default availment period for the organisations you are assigning now. Leave blank to use the default.',
} as const;

// Segmented-control options for the subscription-mode filter.
const MODE_OPTIONS: { value: OrgModeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
];

// Small (i) button that reveals help text on hover (desktop) or tap (mobile).
function InfoTip({
  text,
  align = 'left',
  placement = 'bottom',
}: Readonly<{
  text: string;
  /** Which edge of the icon the tooltip lines up with — use 'right' for right-hand columns. */
  align?: 'left' | 'right';
  /** 'top' opens upward — use it near the bottom of a modal so it isn't clipped. */
  placement?: 'top' | 'bottom';
}>) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More info"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="text-gray-400 hover:text-teal-600"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-30 w-56 rounded-lg bg-gray-900 p-3 text-xs leading-relaxed font-normal text-white shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// Small pill showing an org's billing mode (Auto / Manual). Renders nothing if unknown.
function ModeBadge({ mode }: Readonly<{ mode?: string | null }>) {
  if (!mode) return null;
  const isAuto = mode === 'auto';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        isAuto ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isAuto ? 'Auto' : 'Manual'}
    </span>
  );
}

// All / Auto / Manual segmented toggle.
function ModeFilter({
  value,
  onChange,
}: Readonly<{ value: OrgModeFilter; onChange: (v: OrgModeFilter) => void }>) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {MODE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
            value === opt.value
              ? 'bg-teal-500 text-white shadow-sm'
              : 'text-gray-600 hover:text-black'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function DiscountManagement() {
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [discountScope, setDiscountScope] = useState<'all' | 'auto_recurring' | 'manual_prorate'>(
    'all',
  );
  const [assignFor, setAssignFor] = useState<DiscountRow | null>(null);

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [availmentMonths, setAvailmentMonths] = useState('');
  const [seatAdd, setSeatAdd] = useState(false);
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Assign / manage-orgs state ─────────────────────────
  const [orgSearch, setOrgSearch] = useState('');
  // Subscription-mode filter (All / Auto / Manual) for the org lists.
  const [modeFilter, setModeFilter] = useState<OrgModeFilter>('all');
  const [orgResults, setOrgResults] = useState<OrgResult[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  // Map<orgId, orgName> so picks survive across searches AND filter changes.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [assignMonths, setAssignMonths] = useState('');
  const [assignError, setAssignError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{
    assigned: number;
    skipped: number;
  } | null>(null);

  // Orgs that already hold this discount (with the ability to remove them).
  const [assignedOrgs, setAssignedOrgs] = useState<AssignedOrg[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null); // org_discount_id awaiting confirm
  const [removingId, setRemovingId] = useState<string | null>(null); // org_discount_id being cancelled

  // `silent` = refresh the cards without flashing the full-page spinner.
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await listDiscounts();
    setRows(asArray<DiscountRow>(res));
    setLoading(false);
  };

  const loadAssigned = async (discountId: string) => {
    setAssignedLoading(true);
    try {
      const res = await listDiscountOrgs(discountId);
      setAssignedOrgs(asArray<AssignedOrg>(res));
    } catch {
      setAssignError('Failed to load assigned organizations');
    } finally {
      setAssignedLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Reset the modal whenever it opens for a different discount, then fetch who already holds it.
  useEffect(() => {
    setSelected(new Map());
    setOrgSearch('');
    setModeFilter('all');
    setAssignMonths('');
    setAssignError('');
    setAssignResult(null);
    setOrgResults([]);
    setAssignedOrgs([]);
    setConfirmRemoveId(null);
    if (assignFor) loadAssigned(assignFor.id);
  }, [assignFor?.id]);

  // `assignFor` is a snapshot taken when the modal opened. Use the live row from `rows`
  // so the redemption cap reflects removals/assignments made while the modal is open.
  const liveAssignFor = assignFor ? (rows.find((r) => r.id === assignFor.id) ?? assignFor) : null;
  const liveCapReached =
    !!liveAssignFor &&
    liveAssignFor.max_redemptions !== null &&
    liveAssignFor.redemption_count >= liveAssignFor.max_redemptions;
  // Assigning is only possible for an active rule that still has free slots.
  // Removing existing links is ALWAYS possible (the exceptional-case escape hatch).
  const canAssign = !!liveAssignFor && !!liveAssignFor.is_active && !liveCapReached;

  // Debounced org search while the assign modal is open (and assigning is possible).
  // Re-runs when the text OR the mode filter changes.
  // Empty query returns the first page of orgs, so the list isn't blank on open.
  useEffect(() => {
    if (!assignFor || !canAssign) return;
    const handle = setTimeout(async () => {
      setOrgLoading(true);
      try {
        const res = await searchAssignableOrgs(orgSearch.trim(), modeFilter);
        setOrgResults(asArray<OrgResult>(res));
      } catch {
        setAssignError('Failed to search organizations');
      } finally {
        setOrgLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [assignFor, orgSearch, modeFilter, canAssign]);

  const reset = () => {
    setCode('');
    setTitle('');
    setDescription('');
    setDiscountValue('');
    setValidFrom('');
    setValidTo('');
    setAvailmentMonths('');
    setSeatAdd(false);
    setMaxRedemptions('');
    setDiscountScope('all');
    setError('');
  };

  const submit = async () => {
    if (!title.trim()) return setError('Title is required');
    const val = parseFloat(discountValue);
    if (!val || val <= 0 || val > 100) return setError('Discount must be 1–100%');
    if (!validFrom) return setError('Valid-from date is required');

    setSaving(true);
    setError('');
    try {
      const res = await createDiscount({
        code: code.trim() || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        discountValue: val,
        validFrom: toEpoch(validFrom),
        validTo: validTo ? toEpoch(validTo) : undefined,
        defaultAvailmentMonths: availmentMonths ? parseInt(availmentMonths, 10) : undefined,
        appliesToSeatAdditions: seatAdd,
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : undefined,
        discountScope,
      });
      if (res?.id || res?.succeeded) {
        setShowModal(false);
        reset();
        load();
      } else {
        setError(res?.message?.[0] ?? 'Failed to create discount');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // ── Assign helpers ─────────────────────────────────────
  // Tick/untick an org. Ticked orgs are rendered in the "Selected" section at the top.
  const toggleOrg = (id: string, name: string) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });

  const clearSelected = () => setSelected(new Map());

  const closeAssign = () => setAssignFor(null);

  const submitAssign = async () => {
    if (!assignFor) return;
    if (selected.size === 0) return setAssignError('Select at least one organization');

    setAssigning(true);
    setAssignError('');
    try {
      const res = await assignDiscountToOrgs({
        discountMasterId: assignFor.id,
        organisationIds: Array.from(selected.keys()),
        availmentMonths: assignMonths ? parseInt(assignMonths, 10) : undefined,
      });
      if (res?.succeeded) {
        setAssignResult({
          assigned: res.assigned ?? selected.size,
          skipped: Array.isArray(res.skipped) ? res.skipped.length : (res.skipped ?? 0),
        });
        load(true);
      } else {
        setAssignError(res?.message?.[0] ?? 'Failed to assign discount');
      }
    } catch {
      setAssignError('Something went wrong');
    } finally {
      setAssigning(false);
    }
  };

  // Exceptional-case cancel: delink this discount from one org.
  const removeAssigned = async (o: AssignedOrg) => {
    if (!assignFor) return;
    setRemovingId(o.org_discount_id);
    setAssignError('');
    try {
      const res = await cancelOrgDiscount(o.org_discount_id);
      if (res?.succeeded) {
        setConfirmRemoveId(null);
        // Refresh both the modal list and the cards (redemption count changed).
        await Promise.all([loadAssigned(assignFor.id), load(true)]);
      } else {
        setAssignError(res?.message?.[0] ?? 'Failed to remove discount');
      }
    } catch {
      setAssignError('Something went wrong');
    } finally {
      setRemovingId(null);
    }
  };

  // "Currently assigned" respects the mode filter (client-side; the server already returns the mode).
  const visibleAssigned =
    modeFilter === 'all'
      ? assignedOrgs
      : assignedOrgs.filter((o) => o.subscription_mode === modeFilter);

  // Results list = search results minus orgs already selected (shown on top)
  // and orgs that already hold this discount (shown in "Currently assigned").
  const assignedOrgIds = new Set(assignedOrgs.map((o) => o.organisation_id));
  const visibleResults = orgResults.filter((o) => !selected.has(o.id) && !assignedOrgIds.has(o.id));

  const modeLabel = modeFilter === 'all' ? '' : modeFilter === 'auto' ? 'auto ' : 'manual ';

  return (
    <div className="flex h-full w-full flex-col gap-6 bg-white p-10">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-black">Discounts & Referrals</h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2 font-semibold text-white transition-all hover:bg-teal-600"
        >
          <Plus className="h-4 w-4" /> New discount
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-teal-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-gray-500">No discounts created yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const capReached =
              r.max_redemptions !== null && r.redemption_count >= r.max_redemptions;
            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-5 transition-all ${
                  r.is_active
                    ? 'border-teal-200 bg-teal-50/30'
                    : 'border-gray-200 bg-gray-50/50 opacity-70'
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-teal-600" />
                    <span className="text-lg font-bold text-black">{r.discount_value}% off</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await deactivateDiscount(r.id);
                      load();
                    }}
                    disabled={!r.is_active}
                    className="p-1 text-red-600 hover:text-red-700 disabled:opacity-30"
                    title="Deactivate (stops new assignments; orgs that already have it keep it until removed via Manage orgs)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-black">{r.title}</p>
                {r.code && (
                  <span className="mt-1 inline-block rounded bg-gray-900 px-2 py-0.5 font-mono text-xs text-white">
                    {r.code}
                  </span>
                )}
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <p>
                    Valid: {fmtDate(r.valid_from)} → {fmtDate(r.valid_to)}
                  </p>
                  <p>
                    Availment:{' '}
                    {r.default_availment_months
                      ? `${r.default_availment_months} months`
                      : 'follows validity'}
                  </p>
                  <p>Seat additions: {r.applies_to_seat_additions ? 'Included' : 'Excluded'}</p>
                  <p>
                    Redeemed: {r.redemption_count}
                    {r.max_redemptions ? ` / ${r.max_redemptions}` : ' (unlimited)'}
                  </p>
                </div>
                {/* Always enabled: even when the cap is reached or the rule is deactivated,
                    the admin must still be able to open the modal and remove an org. */}
                <button
                  type="button"
                  onClick={() => setAssignFor(r)}
                  className="mt-4 w-full rounded-md bg-teal-500 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-600"
                >
                  {capReached ? 'Manage orgs (limit reached)' : 'Assign / manage orgs'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create discount modal ───────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
          <div className="max-h-[90vh] w-125 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-black">New discount / referral</h3>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setShowModal(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <Field label="Applicable to" required info={INFO.scope}>
                <select
                  value={discountScope}
                  onChange={(e) => setDiscountScope(e.target.value as typeof discountScope)}
                  className="input"
                >
                  <option value="all">All charges (recurring + prorate/manual)</option>
                  <option value="auto_recurring">Auto recurring only (Razorpay offer)</option>
                  <option value="manual_prorate">Manual bills + prorate only</option>
                </select>
              </Field>

              <Field label="Referral code (optional)" info={INFO.code}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. BIGTEAM20"
                  className="input"
                />
              </Field>
              <Field label="Title" required info={INFO.title}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Volume discount — Pro"
                  className="input"
                />
              </Field>
              <Field label="Description" info={INFO.description}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="input"
                />
              </Field>
              <Field label="Discount %" required info={INFO.discountValue}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="20"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valid from" required info={INFO.validFrom}>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="input"
                  />
                </Field>
                {/* Right-hand column → align tooltip to the right so it doesn't overflow the modal */}
                <Field label="Valid to" info={INFO.validTo} tipAlign="right">
                  <input
                    type="date"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Availment (months)" info={INFO.availmentMonths}>
                  <input
                    type="number"
                    min={1}
                    value={availmentMonths}
                    onChange={(e) => setAvailmentMonths(e.target.value)}
                    placeholder="e.g. 3"
                    className="input"
                  />
                </Field>
                <Field label="Max redemptions" info={INFO.maxRedemptions} tipAlign="right">
                  <input
                    type="number"
                    min={1}
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="unlimited"
                    className="input"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-black">
                  <input
                    type="checkbox"
                    checked={seatAdd}
                    onChange={(e) => setSeatAdd(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600"
                  />
                  Apply discount to seats added later
                </label>
                <InfoTip text={INFO.seatAdd} align="right" placement="top" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setShowModal(false);
                }}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="rounded-lg bg-teal-500 px-5 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Create discount'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign / manage orgs modal ──────────────────── */}
      {assignFor && liveAssignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-150 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h3 className="text-xl font-bold text-black">Assign / manage organizations</h3>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-semibold text-teal-600">
                    {liveAssignFor.discount_value}% off
                  </span>{' '}
                  · {liveAssignFor.title}
                  {liveAssignFor.code && (
                    <span className="ml-2 rounded bg-gray-900 px-2 py-0.5 font-mono text-xs text-white">
                      {liveAssignFor.code}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssign}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {assignResult ? (
              /* Success state */
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100">
                  <Check className="h-7 w-7 text-teal-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-black">
                    Assigned to {assignResult.assigned} organization
                    {assignResult.assigned === 1 ? '' : 's'}.
                  </p>
                  {assignResult.skipped > 0 && (
                    <p className="mt-1 text-sm text-amber-600">
                      {assignResult.skipped} skipped (already assigned or redemption limit reached).
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeAssign}
                  className="rounded-lg bg-teal-500 px-6 py-2.5 font-semibold text-white hover:bg-teal-600"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Controls */}
                <div className="space-y-3 p-6 pb-3">
                  {assignError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-semibold text-red-800">{assignError}</p>
                    </div>
                  )}

                  {/* Why assigning is disabled — removing is still allowed */}
                  {!canAssign && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm text-amber-800">
                        {liveAssignFor.is_active
                          ? 'Redemption limit reached — no new organizations can be added. Remove an organization below to free up a slot.'
                          : 'This discount is deactivated — no new organizations can be added. You can still remove existing ones below.'}
                      </p>
                    </div>
                  )}

                  {/* Subscription-mode filter — shown even when assigning is disabled,
                      because it also narrows the "Currently assigned" list. */}
                  <Field label="Subscription mode" info={INFO.modeFilter}>
                    <ModeFilter value={modeFilter} onChange={setModeFilter} />
                  </Field>

                  {canAssign && (
                    <Field label="Search organizations" info={INFO.orgSearch}>
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          value={orgSearch}
                          onChange={(e) => setOrgSearch(e.target.value)}
                          placeholder="Search organizations by name…"
                          className="input !pl-9"
                        />
                      </div>
                    </Field>
                  )}
                </div>

                {/* Scrollable body: Currently assigned → Selected → Search results */}
                <div className="min-h-40 flex-1 overflow-y-auto border-y border-gray-100 px-6 py-3">
                  {/* 1) Currently assigned — exceptional-case removal lives here */}
                  <section className="mb-4">
                    <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      Currently assigned (
                      {modeFilter === 'all'
                        ? assignedOrgs.length
                        : `${visibleAssigned.length} of ${assignedOrgs.length}`}
                      )
                    </h4>
                    {assignedLoading ? (
                      <div className="flex h-12 items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-teal-500" />
                      </div>
                    ) : visibleAssigned.length === 0 ? (
                      <p className="py-2 text-sm text-gray-400">
                        {assignedOrgs.length === 0
                          ? 'No organizations hold this discount yet.'
                          : `No ${modeLabel}organizations hold this discount.`}
                      </p>
                    ) : (
                      <ul className="max-h-48 divide-y divide-gray-50 overflow-y-auto">
                        {visibleAssigned.map((o) => {
                          const confirming = confirmRemoveId === o.org_discount_id;
                          const removing = removingId === o.org_discount_id;
                          return (
                            <li
                              key={o.org_discount_id}
                              className="flex items-center justify-between gap-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-black">
                                    {o.org_name}
                                  </p>
                                  <ModeBadge mode={o.subscription_mode} />
                                </div>
                                <p className="text-xs text-gray-500">
                                  Since {fmtDate(o.activated_at)} · Expires {fmtDate(o.expires_at)}
                                </p>
                              </div>
                              {confirming ? (
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-red-700">
                                    Remove discount from this org?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeAssigned(o)}
                                    disabled={removing}
                                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {removing ? 'Removing…' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveId(null)}
                                    disabled={removing}
                                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveId(o.org_discount_id)}
                                  className="shrink-0 rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {canAssign && (
                    <>
                      {/* 2) Selected (to be assigned) — pinned above the search results.
                          Not affected by the mode filter, so picks never disappear. */}
                      {selected.size > 0 && (
                        <section className="mb-4">
                          <div className="mb-1 flex items-center justify-between">
                            <h4 className="text-xs font-semibold tracking-wide text-teal-700 uppercase">
                              Selected to assign ({selected.size})
                            </h4>
                            <button
                              type="button"
                              onClick={clearSelected}
                              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                            >
                              Clear all
                            </button>
                          </div>
                          <ul className="divide-y divide-gray-50 rounded-lg bg-teal-50/50 px-3">
                            {Array.from(selected.entries()).map(([id, name]) => (
                              <li key={id}>
                                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked
                                    onChange={() => toggleOrg(id, name)}
                                    className="h-4 w-4 rounded border-gray-300 text-teal-600"
                                  />
                                  <span className="truncate text-sm font-semibold text-black">
                                    {name}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* 3) Search results (excludes selected + already assigned) */}
                      <section>
                        <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                          {orgSearch.trim() ? 'Search results' : 'Organizations'}
                          {modeFilter !== 'all' && ` · ${modeFilter}`}
                        </h4>
                        {orgLoading ? (
                          <div className="flex h-24 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-teal-500" />
                          </div>
                        ) : visibleResults.length === 0 ? (
                          <div className="py-8 text-center text-sm text-gray-500">
                            {orgSearch.trim()
                              ? `No other ${modeLabel}organizations match.`
                              : `No more ${modeLabel}organizations to show.`}
                          </div>
                        ) : (
                          <ul className="divide-y divide-gray-50">
                            {visibleResults.map((o) => (
                              <li key={o.id}>
                                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(o.id)}
                                    onChange={() => toggleOrg(o.id, o.org_name)}
                                    className="h-4 w-4 rounded border-gray-300 text-teal-600"
                                  />
                                  <span className="truncate text-sm font-semibold text-black">
                                    {o.org_name}
                                  </span>
                                  <ModeBadge mode={o.subscription_mode} />
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!orgSearch.trim() && orgResults.length >= 25 && (
                          <p className="py-2 text-center text-xs text-gray-400">
                            Showing first 25 — type to narrow the list.
                          </p>
                        )}
                      </section>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="space-y-4 p-6">
                  {canAssign && (
                    <Field
                      label="Availment override (months)"
                      info={INFO.assignMonths}
                      tipPlacement="top"
                    >
                      <input
                        type="number"
                        min={1}
                        value={assignMonths}
                        onChange={(e) => setAssignMonths(e.target.value)}
                        placeholder={
                          liveAssignFor.default_availment_months
                            ? `default: ${liveAssignFor.default_availment_months}`
                            : 'follows validity'
                        }
                        className="input"
                      />
                    </Field>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {canAssign ? `${selected.size} selected` : ''}
                    </span>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={closeAssign}
                        disabled={assigning}
                        className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {canAssign ? 'Cancel' : 'Close'}
                      </button>
                      {canAssign && (
                        <button
                          type="button"
                          onClick={submitAssign}
                          disabled={assigning || selected.size === 0}
                          className="rounded-lg bg-teal-500 px-5 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                        >
                          {assigning
                            ? 'Assigning…'
                            : `Assign${selected.size ? ` ${selected.size}` : ''}`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Labelled form row with an optional (i) help button next to the label.
function Field({
  label,
  required,
  info,
  tipAlign,
  tipPlacement,
  children,
}: Readonly<{
  label: string;
  required?: boolean;
  /** Help text shown in the (i) tooltip. Omit to hide the button. */
  info?: string;
  tipAlign?: 'left' | 'right';
  tipPlacement?: 'top' | 'bottom';
  children: React.ReactNode;
}>) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <label className="block font-semibold text-black">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {info && <InfoTip text={info} align={tipAlign} placement={tipPlacement} />}
      </div>
      {children}
    </div>
  );
}
