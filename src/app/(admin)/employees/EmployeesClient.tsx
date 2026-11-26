'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isoToFlagEmoji, uniqueCountries } from '@/constants/country';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HardHat,
  Hash,
  Link2,
  LogOut,
  MoreVertical,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';

import { Employee, EmployeesResponse, RoleOption } from '@/types/employee';
import {
  activateEmployee,
  canOffboardEmployee,
  changeEmployeeCode,
  createEmployeeContext,
  deactivateEmployee,
  fetchAdminEmployees,
  fetchAssignableRoles,
  offboardEmployeeAdmin,
  updateEmployeeBasicDetails,
  updateEmployeePhone,
  updateEmployeeRole,
  UserStatusEnum,
} from '@/lib/employee';
import { Input } from '@/components/ui/input';
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

/** Matches backend UserTypesEnum. */
const UserType = {
  Employee: 100,
  Contractor: 101,
  AgencyAdmin: 102,
  OrganisationAdmin: 103,
} as const;

const USER_TYPE_OPTIONS: { value: number; label: string }[] = [
  { value: UserType.Employee, label: 'Employee' },
  { value: UserType.Contractor, label: 'Contractor' },
  { value: UserType.AgencyAdmin, label: 'Agency Admin' },
  { value: UserType.OrganisationAdmin, label: 'Organisation Admin' },
];

const USER_TYPE_LABEL: Record<number, string> = Object.fromEntries(
  USER_TYPE_OPTIONS.map((t) => [t.value, t.label]),
);

type Section = 'employee' | 'contractor';

/**
 * Only 100 / 101 are sent. Backend expands them:
 * 100 → Employee + Organisation Admin (100, 103), 101 → Contractor + Agency Admin (101, 102).
 */
const SECTION_TYPE: Record<Section, 100 | 101> = {
  employee: UserType.Employee,
  contractor: UserType.Contractor,
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MAX_PAGE_BUTTONS = 7;
const SEARCH_DEBOUNCE_MS = 400;
const TABLE_COLUMN_COUNT = 9;

const TH =
  'sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-black uppercase';
const TD = 'px-3 py-2.5 align-middle text-sm text-black';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmployeeRow = Employee & {
  onboarded_at?: number | string | null;
  employeeTypeId?: number | string | null;
  type_id?: number | string | null;
};

type ModalKind =
  | { type: 'phone'; emp: EmployeeRow }
  | { type: 'code'; emp: EmployeeRow }
  | { type: 'details'; emp: EmployeeRow }
  | { type: 'role'; emp: EmployeeRow }
  | { type: 'confirm-offboard'; emp: EmployeeRow }
  | { type: 'confirm-deactivate'; emp: EmployeeRow }
  | null;

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

const fmtDate = (value: unknown): string => {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const initials = (name?: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

const getTypeId = (emp: EmployeeRow): number | null => {
  const raw = emp.employeeTypeId ?? emp.type_id;
  return raw === null || raw === undefined ? null : Number(raw);
};

const EMPLOYEE_STATUS_STYLE = {
  deleted: { label: 'Deleted', className: 'bg-gray-800 text-white' },
  offboarded: { label: 'Offboarded', className: 'bg-red-50 text-red-700 ring-1 ring-red-500/20' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-black ring-1 ring-gray-300/60' },
  invited: { label: 'Invited', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-500/20' },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  },
  unknown: { label: 'Unknown', className: 'bg-gray-100 text-black ring-1 ring-gray-300/60' },
} as const;

function resolveEmployeeStatus(emp: EmployeeRow) {
  const status = Number(emp.status);
  if (Number(emp.deleted) === 1) return EMPLOYEE_STATUS_STYLE.deleted;
  if (status === UserStatusEnum.XEmployee) return EMPLOYEE_STATUS_STYLE.offboarded;
  if (Number(emp.is_active) !== 1) return EMPLOYEE_STATUS_STYLE.inactive;
  if (status === UserStatusEnum.InvitationSent) return EMPLOYEE_STATUS_STYLE.invited;
  if (status === UserStatusEnum.Registered) return EMPLOYEE_STATUS_STYLE.active;
  return EMPLOYEE_STATUS_STYLE.unknown;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Single place that talks to the list API (GET /organisations/:orgId/employees/admin-list). */
async function loadEmployeesPage(params: {
  orgId: string;
  page: number;
  size: number;
  search: string;
  type: 100 | 101;
  status: string;
  showDeleted: boolean;
}): Promise<EmployeesResponse> {
  return fetchAdminEmployees(params.orgId, {
    pageNumber: params.page,
    pageSize: params.size,
    search: params.search,
    type: params.type,
    status: params.status === '' ? '' : Number(params.status),
    includeDeleted: params.showDeleted,
    fieldName: 'created_at',
    orderBy: 'DESC',
  });
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: String(UserStatusEnum.Registered), label: 'Active' },
  { value: String(UserStatusEnum.InvitationSent), label: 'Invited' },
  { value: String(UserStatusEnum.XEmployee), label: 'Offboarded' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmployeesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('id');
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const [section, setSection] = useState<Section>('employee');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const load = async () => {
    if (!organizationId) {
      setError('Organization ID not provided');
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const res = await loadEmployeesPage({
        orgId: organizationId,
        page: pageNumber,
        size: pageSize,
        search: debouncedSearch,
        type: SECTION_TYPE[section],
        status: statusFilter === 'all' ? '' : statusFilter,
        showDeleted,
      });
      if (requestId !== requestIdRef.current) return; // a newer request superseded this one
      if (res?.succeeded) {
        setEmployees((res.data as EmployeeRow[]) || []);
        setTotalItems(Number(res.totalItems) || 0);
      } else {
        setEmployees([]);
        setTotalItems(0);
        setError(res?.message?.join(', ') || 'Failed to fetch employees');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, pageNumber, pageSize, showDeleted, section, debouncedSearch, statusFilter]);

  // Reset to page 1 whenever the search term settles
  useEffect(() => {
    setPageNumber(1);
  }, [debouncedSearch]);

  // Close the floating menu on outside click / any scroll
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onScroll = () => setOpenMenu(null);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const runAction = async (fn: () => Promise<unknown>, closeModal = true) => {
    if (!organizationId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await fn();
      if (closeModal) setModal(null);
      setOpenMenu(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const toggleMenu = (empId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenu?.id === empId) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 340;
    const openUp = rect.bottom + menuHeight > window.innerHeight;
    setOpenMenu({
      id: empId,
      top: (openUp ? rect.top - menuHeight : rect.bottom + 4) + window.scrollY,
      left: rect.right + window.scrollX - 224,
    });
  };

  const handleActivate = (emp: EmployeeRow) =>
    runAction(() => activateEmployee(organizationId!, emp.id));
  const handleCreateContext = (emp: EmployeeRow) =>
    runAction(() => createEmployeeContext(organizationId!, emp.id));
  const handleDelete = (id: string) => router.push(`/offboarding?emp_id=${id}`);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const endItem = Math.min(pageNumber * pageSize, totalItems);
  const sectionNoun = section === 'employee' ? 'employees' : 'contractors';

  return (
    <div className="flex h-full min-w-0 flex-col p-5 md:p-6">
      {/* Header */}
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="mt-1 rounded-md p-1 text-black transition-colors hover:bg-teal-50 hover:text-teal-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-black">Employees</h1>
            <p className="text-sm text-black">
              Manage people, roles and access for this organisation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
          {section === 'employee' ? (
            <Users className="h-4 w-4 text-teal-600" />
          ) : (
            <HardHat className="h-4 w-4 text-teal-600" />
          )}
          <span className="text-sm text-black">Total {sectionNoun}</span>
          <span className="text-sm font-semibold text-black tabular-nums">{totalItems}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        {/* Section switch */}
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm"
          role="tablist"
        >
          {(['employee', 'contractor'] as Section[]).map((s) => {
            const active = section === s;
            const Icon = s === 'employee' ? Users : HardHat;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                key={s}
                onClick={() => {
                  setSection(s);
                  setPageNumber(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-teal-600 text-white shadow-sm' : 'text-black hover:bg-teal-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {s === 'employee' ? 'Employees' : 'Contractors'}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-black/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search name, code, email or phone…`}
            className="h-9 w-72 bg-white pr-8 pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-black/60 hover:bg-gray-100 hover:text-black"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPageNumber(1);
          }}
        >
          <SelectTrigger className="h-9 w-36 bg-white">
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

        {/* Show deleted */}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-black select-none">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPageNumber(1);
              }}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-1" />
            <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
          </span>
          Show deleted users
        </label>

        {loading && employees.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-black">
            <RefreshCw className="h-3 w-3 animate-spin text-teal-600" />
            Refreshing…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">Error loading {sectionNoun}</p>
          <p className="mt-0.5 text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-265 border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${TH} min-w-56`}>Name</th>
                <th className={TH}>Emp code</th>
                <th className={TH}>Email</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Role</th>
                <th className={TH}>Onboarded</th>
                <th className={TH}>Status</th>
                <th className={`${TH} w-12`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && employees.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-black">
                      <RefreshCw className="h-5 w-5 animate-spin text-teal-600" />
                      <span className="text-sm">Loading {sectionNoun}…</span>
                    </div>
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-1.5 text-black">
                      <Search className="h-5 w-5 text-black/40" />
                      <span className="text-sm font-medium">
                        {debouncedSearch
                          ? `No ${sectionNoun} match "${debouncedSearch}"`
                          : `No ${sectionNoun} found`}
                      </span>
                      {debouncedSearch && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-xs font-medium text-teal-700 hover:underline"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const isDeleted = Number(emp.deleted) === 1;
                  const rowStatus = resolveEmployeeStatus(emp);
                  const typeId = getTypeId(emp);
                  const isMenuOpen = openMenu?.id === emp.id;

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors hover:bg-teal-50/40 ${isDeleted ? 'bg-gray-50 opacity-70' : ''}`}
                    >
                      {/* Name */}
                      <td className={`${TD} border-b border-gray-100`}>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800">
                            {initials(emp.display_name)}
                          </span>
                          <div className="min-w-0">
                            <div
                              title={emp.display_name}
                              className={`max-w-52 truncate font-semibold ${isDeleted ? 'line-through' : ''}`}
                            >
                              {emp.display_name || '—'}
                            </div>
                            {typeId !== null && (
                              <div className="text-xs text-black">
                                {USER_TYPE_LABEL[typeId] ?? `Type ${typeId}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td
                        className={`${TD} border-b border-gray-100 whitespace-nowrap tabular-nums`}
                      >
                        {emp.code_prefix
                          ? `${emp.code_prefix}${emp.user_code ?? ''}`
                          : emp.user_code || '—'}
                      </td>

                      <td className={`${TD} border-b border-gray-100`}>
                        <span title={emp.email_id || ''} className="block max-w-52 truncate">
                          {emp.email_id || '—'}
                        </span>
                      </td>

                      <td
                        className={`${TD} border-b border-gray-100 whitespace-nowrap tabular-nums`}
                      >
                        {emp.phone_number ? `${emp.dial_code || ''} ${emp.phone_number}` : '—'}
                      </td>

                      <td className={`${TD} border-b border-gray-100 whitespace-nowrap`}>
                        {emp.role_name || '—'}
                      </td>

                      <td
                        className={`${TD} border-b border-gray-100 whitespace-nowrap tabular-nums`}
                        title={
                          emp.onboarded_at
                            ? `Joined ${fmtDate(emp.onboarded_at)}`
                            : 'No joining date'
                        }
                      >
                        {fmtDate(emp.onboarded_at)}
                      </td>

                      <td className={`${TD} border-b border-gray-100 whitespace-nowrap`}>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${rowStatus.className}`}
                        >
                          {rowStatus.label}
                        </span>
                      </td>

                      <td className={`${TD} border-b border-gray-100 text-right`}>
                        <button
                          type="button"
                          onClick={(e) => toggleMenu(emp.id, e)}
                          className={`rounded-md p-1.5 text-black transition-colors hover:bg-gray-100 ${
                            isMenuOpen ? 'bg-gray-100' : ''
                          }`}
                          aria-label="Employee actions"
                          aria-expanded={isMenuOpen}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <Pagination
          pageNumber={pageNumber}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startItem={startItem}
          endItem={endItem}
          noun={sectionNoun}
          onPageChange={setPageNumber}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPageNumber(1);
          }}
        />
      )}

      {/* Row action menu */}
      {openMenu &&
        typeof window !== 'undefined' &&
        createPortal(
          (() => {
            const emp = employees.find((e) => e.id === openMenu.id);
            if (!emp) return null;
            const isDeleted = emp.deleted === 1;
            const hasContext = Number(emp.has_context) === 1;
            const status = emp.status ?? -1;
            const isActive = Number(emp.is_active) === 1;
            const isXEmployee = status === UserStatusEnum.XEmployee;
            const isInvited = status === UserStatusEnum.InvitationSent;
            const isRegistered = status === UserStatusEnum.Registered;
            const offboardable = canOffboardEmployee(status, emp.deleted);
            const canActivate = !isXEmployee && (isInvited || !isActive);
            const canDeactivate = isRegistered && isActive;

            const openModal = (m: NonNullable<ModalKind>) => {
              setModal(m);
              setOpenMenu(null);
            };

            return (
              <div
                ref={menuRef}
                style={{ position: 'absolute', top: openMenu.top, left: openMenu.left }}
                className="z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                {isDeleted ? (
                  <span className="block px-3 py-2 text-xs text-black">
                    Deleted user — no actions
                  </span>
                ) : (
                  <>
                    <MenuLabel>Access</MenuLabel>
                    {!hasContext && (
                      <MenuItem
                        icon={<Link2 className="h-4 w-4" />}
                        label="Link user context"
                        onClick={() => handleCreateContext(emp)}
                      />
                    )}
                    {canActivate && (
                      <MenuItem
                        icon={<UserCheck className="h-4 w-4" />}
                        label="Activate employee"
                        onClick={() => handleActivate(emp)}
                      />
                    )}
                    {canDeactivate && (
                      <MenuItem
                        icon={<UserX className="h-4 w-4" />}
                        label="Deactivate employee"
                        onClick={() => openModal({ type: 'confirm-deactivate', emp })}
                      />
                    )}

                    <MenuDivider />
                    <MenuLabel>Edit</MenuLabel>
                    <MenuItem
                      icon={<Phone className="h-4 w-4" />}
                      label="Change phone number"
                      onClick={() => openModal({ type: 'phone', emp })}
                    />
                    <MenuItem
                      icon={<Hash className="h-4 w-4" />}
                      label="Change employee code"
                      onClick={() => openModal({ type: 'code', emp })}
                    />
                    <MenuItem
                      icon={<Pencil className="h-4 w-4" />}
                      label="Edit basic details"
                      onClick={() => openModal({ type: 'details', emp })}
                    />
                    <MenuItem
                      icon={<ShieldCheck className="h-4 w-4" />}
                      label="Change role"
                      onClick={() => openModal({ type: 'role', emp })}
                    />

                    {((offboardable && !isXEmployee) || isSuperAdmin) && <MenuDivider />}
                    {offboardable && !isXEmployee && (
                      <MenuItem
                        icon={<LogOut className="h-4 w-4" />}
                        label="Delete employee"
                        danger
                        onClick={() => openModal({ type: 'confirm-offboard', emp })}
                      />
                    )}
                    {isSuperAdmin && (
                      <MenuItem
                        icon={<Trash2 className="h-4 w-4" />}
                        label="Delete employee (offboarding)"
                        danger
                        onClick={() => {
                          setOpenMenu(null);
                          handleDelete(emp.id);
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })(),
          document.body,
        )}

      {modal && organizationId && (
        <ActionModal
          modal={modal}
          orgId={organizationId}
          busy={actionBusy}
          error={actionError}
          onClose={() => {
            setModal(null);
            setActionError(null);
          }}
          onConfirmOffboard={(emp, exitDate) =>
            runAction(() => offboardEmployeeAdmin(organizationId, emp.id, exitDate))
          }
          onConfirmDeactivate={(emp) => runAction(() => deactivateEmployee(organizationId, emp.id))}
          onSavePhone={(emp, dialCode, phoneNumber) =>
            runAction(() => updateEmployeePhone(organizationId, emp.id, dialCode, phoneNumber))
          }
          onSaveCode={(emp, userCode, codePrefix) =>
            runAction(() => changeEmployeeCode(organizationId, emp.id, userCode, codePrefix))
          }
          onSaveDetails={(emp, body) =>
            runAction(() => updateEmployeeBasicDetails(organizationId, emp.id, body))
          }
          onSaveRole={(emp, roleId, roleType, typeId) =>
            runAction(() => updateEmployeeRole(organizationId, emp.id, roleId, roleType, typeId))
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  pageNumber,
  totalPages,
  pageSize,
  totalItems,
  startItem,
  endItem,
  noun,
  onPageChange,
  onPageSizeChange,
}: Readonly<{
  pageNumber: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  noun: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}>) {
  const buildPageList = (): (number | '...')[] => {
    if (totalPages <= MAX_PAGE_BUTTONS) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const left = pageNumber - 2;
    const right = pageNumber + 2;
    const pages: (number | '...')[] = [1];
    if (left > 2) pages.push('...');
    for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const navBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-black transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-y-2 text-sm text-black">
      <span className="text-xs">
        Showing{' '}
        <span className="font-semibold">
          {startItem}–{endItem}
        </span>{' '}
        of <span className="font-semibold">{totalItems}</span> {noun}
      </span>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-20 bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
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
          {buildPageList().map((page, idx) =>
            page === '...' ? (
              // eslint-disable-next-line react/no-array-index-key
              <span
                key={`e-${idx}`}
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
// Menu bits
// ---------------------------------------------------------------------------

function MenuLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-black/60 uppercase">
      {children}
    </div>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-gray-100" />;
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: Readonly<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-black hover:bg-teal-50 hover:text-teal-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

const fieldCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-gray-50';
const primaryBtn =
  'w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50';

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  error,
}: Readonly<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  error: string | null;
}>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-black">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-black">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-black transition-colors hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {children}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-black transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  modal,
  orgId,
  busy,
  error,
  onClose,
  onConfirmOffboard,
  onConfirmDeactivate,
  onSavePhone,
  onSaveCode,
  onSaveDetails,
  onSaveRole,
}: Readonly<{
  modal: NonNullable<ModalKind>;
  orgId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmOffboard: (emp: EmployeeRow, exitDate?: number) => void;
  onConfirmDeactivate: (emp: EmployeeRow) => void;
  onSavePhone: (emp: EmployeeRow, dialCode: string, phoneNumber: string) => void;
  onSaveCode: (emp: EmployeeRow, userCode: string, codePrefix?: string) => void;
  onSaveDetails: (
    emp: EmployeeRow,
    body: { firstName?: string; lastName?: string; emailId?: string; address?: string },
  ) => void;
  onSaveRole: (emp: EmployeeRow, roleId: string, roleType: number, typeId: number) => void;
}>) {
  const normalizeDialCode = (code?: string) => {
    if (!code) return '+91';
    return code.startsWith('+') ? code : `+${code}`;
  };
  const [dialCode, setDialCode] = useState(normalizeDialCode(modal.emp.dial_code));
  const [phoneNumber, setPhoneNumber] = useState(modal.emp.phone_number || '');
  const [userCode, setUserCode] = useState(modal.emp.user_code || '');
  const [codePrefix, setCodePrefix] = useState(modal.emp.code_prefix || '');
  const [firstName, setFirstName] = useState(modal.emp.display_name?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(
    modal.emp.display_name?.split(' ').slice(1).join(' ') || '',
  );
  const [emailId, setEmailId] = useState(modal.emp.email_id || '');

  const [roleId, setRoleId] = useState(modal.emp.role_id || '');
  const initialTypeId = getTypeId(modal.emp);
  const [typeId, setTypeId] = useState<number | ''>(initialTypeId ?? '');
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  useEffect(() => {
    if (modal.type !== 'role') return;
    let cancelled = false;
    (async () => {
      try {
        setRolesLoading(true);
        setRolesError(null);
        const data = await fetchAssignableRoles(orgId);
        if (!cancelled) setRoles(data);
      } catch (err) {
        if (!cancelled) setRolesError(err instanceof Error ? err.message : 'Failed to load roles');
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.type, orgId]);

  const name = modal.emp.display_name || 'this employee';

  if (modal.type === 'confirm-offboard') {
    return (
      <ModalShell title="Offboard employee" subtitle={name} onClose={onClose} error={error}>
        <p className="mb-4 text-sm text-black">
          This will mark <strong>{name}</strong> as an ex-employee and deactivate their account.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirmOffboard(modal.emp)}
          className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Offboarding…' : 'Confirm offboard'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'confirm-deactivate') {
    return (
      <ModalShell title="Deactivate employee" subtitle={name} onClose={onClose} error={error}>
        <p className="mb-4 text-sm text-black">
          <strong>{name}</strong> will lose access immediately. You can reactivate them later from
          the same menu.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirmDeactivate(modal.emp)}
          className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? 'Deactivating…' : 'Confirm deactivate'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'phone') {
    return (
      <ModalShell title="Change phone number" subtitle={name} onClose={onClose} error={error}>
        <div className="mb-3 flex gap-2">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className={`${fieldCls} w-32`}
          >
            {uniqueCountries.map((c) => (
              <option key={c.countryCodeAlpha} value={c.code}>
                {isoToFlagEmoji(c.countryCodeAlpha)} {c.code} ({c.countryCodeAlpha})
              </option>
            ))}
          </select>
          <input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="9876543210"
            inputMode="numeric"
            className={`${fieldCls} flex-1`}
          />
        </div>
        <button
          type="button"
          disabled={busy || !phoneNumber.trim()}
          onClick={() => onSavePhone(modal.emp, dialCode, phoneNumber.trim())}
          className={primaryBtn}
        >
          {busy ? 'Saving…' : 'Save phone number'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'code') {
    return (
      <ModalShell title="Change employee code" subtitle={name} onClose={onClose} error={error}>
        <label className="mb-1 block text-xs font-medium text-black">Code prefix (optional)</label>
        <input
          value={codePrefix}
          onChange={(e) => setCodePrefix(e.target.value)}
          placeholder="e.g. EMP2026"
          className={`${fieldCls} mb-3`}
        />
        <label className="mb-1 block text-xs font-medium text-black">Code number</label>
        <input
          value={userCode}
          onChange={(e) => setUserCode(e.target.value)}
          placeholder="e.g. 0011"
          className={`${fieldCls} mb-3`}
        />
        <button
          type="button"
          disabled={busy || !userCode.trim()}
          onClick={() => onSaveCode(modal.emp, userCode.trim(), codePrefix.trim() || undefined)}
          className={primaryBtn}
        >
          {busy ? 'Saving…' : 'Save code'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'details') {
    return (
      <ModalShell title="Edit basic details" subtitle={name} onClose={onClose} error={error}>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-black">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-black">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>
        <label className="mb-1 block text-xs font-medium text-black">Email</label>
        <input
          type="email"
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          className={`${fieldCls} mb-3`}
        />
        <button
          type="button"
          disabled={busy || !firstName.trim()}
          onClick={() =>
            onSaveDetails(modal.emp, {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              emailId: emailId.trim(),
            })
          }
          className={primaryBtn}
        >
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'role') {
    const isUnlocked = (r: RoleOption) => r.type_id === null || r.type_id === undefined;
    const rolesForType = roles.filter(
      (r) => typeId === '' || isUnlocked(r) || r.type_id === typeId,
    );

    return (
      <ModalShell title="Change role" subtitle={name} onClose={onClose} error={error || rolesError}>
        <label className="mb-1 block text-xs font-medium text-black">User type</label>
        <select
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value === '' ? '' : Number(e.target.value));
            setRoleId('');
          }}
          disabled={rolesLoading}
          className={`${fieldCls} mb-3`}
        >
          <option value="">Select user type…</option>
          {USER_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-black">Role</label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          disabled={rolesLoading || typeId === ''}
          className={`${fieldCls} mb-3`}
        >
          <option value="">
            {rolesLoading
              ? 'Loading roles…'
              : typeId === ''
                ? 'Select user type first…'
                : 'Select role…'}
          </option>
          {rolesForType.map((r) => (
            <option key={r.id} value={r.id}>
              {r.role_name}
              {r.role_type === 101 ? ' (Custom)' : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy || !roleId || typeId === ''}
          onClick={() => {
            const selected = roles.find((r) => r.id === roleId);
            if (selected && typeId !== '')
              onSaveRole(modal.emp, selected.id, selected.role_type, typeId);
          }}
          className={primaryBtn}
        >
          {busy ? 'Saving…' : 'Save role'}
        </button>
      </ModalShell>
    );
  }

  return null;
}
