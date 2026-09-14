'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isoToFlagEmoji, uniqueCountries } from '@/constants/country';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import {
  ArrowLeft,
  Hash,
  Link2,
  LogOut,
  MoreVertical,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
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
  fetchAssignableRoles,
  fetchEmployees,
  getEmployeeStatusBadgeClass,
  getEmployeeStatusLabel,
  offboardEmployeeAdmin,
  updateEmployeeBasicDetails,
  updateEmployeePhone,
  updateEmployeeRole,
  UserStatusEnum,
} from '@/lib/employee';

// Static — matches backend UserTypesEnum exactly. Payload value is the enum
// number (100/101/102/103), label is just for display.
const USER_TYPE_OPTIONS: { value: number; label: string }[] = [
  { value: 100, label: 'Employee' },
  { value: 101, label: 'Contractor' },
  { value: 102, label: 'Agency Admin' },
  { value: 103, label: 'Organisation Admin' },
];

type Section = 'employee' | 'contractor';

type ModalKind =
  | { type: 'phone'; emp: Employee }
  | { type: 'code'; emp: Employee }
  | { type: 'details'; emp: Employee }
  | { type: 'role'; emp: Employee }
  | { type: 'confirm-offboard'; emp: Employee }
  | { type: 'confirm-deactivate'; emp: Employee }
  | null;

export default function EmployeesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('id');
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const [section, setSection] = useState<Section>('employee');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 10;
  const [totalItems, setTotalItems] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!organizationId) {
      setError('Organization ID not provided');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const empResponse: EmployeesResponse = await fetchEmployees(
        organizationId,
        pageNumber,
        pageSize,
        '',
        '',
        '',
        '',
        'ASC',
        '',
        showDeleted as any,
      );
      if (empResponse?.succeeded) {
        setEmployees((empResponse.data as Employee[]) || []);
        setTotalItems(Number(empResponse.totalItems) || 0);
      } else {
        setError(empResponse?.message?.join(', ') || 'Failed to fetch employees');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, pageNumber, pageSize, showDeleted, section]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', () => setOpenMenu(null), true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', () => setOpenMenu(null), true);
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
    setOpenMenu({
      id: empId,
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - 224,
    });
  };

  const handleOffboard = (emp: Employee) => setModal({ type: 'confirm-offboard', emp });
  const handleDeactivate = (emp: Employee) => setModal({ type: 'confirm-deactivate', emp });
  const handleActivate = (emp: Employee) =>
    runAction(() => activateEmployee(organizationId!, emp.id));
  const handleCreateContext = (emp: Employee) =>
    runAction(() => createEmployeeContext(organizationId!, emp.id));

  const handleDelete = (id: string) => {
    router.push(`/offboarding?emp_id=${id}`);
  };

  return (
    <div className="p-8">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="cursor-pointer text-gray-600 hover:text-teal-600"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
        </div>

        <div className="mb-4 flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
              {(['employee', 'contractor'] as Section[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSection(s);
                    setPageNumber(1);
                  }}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    section === s
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s === 'employee' ? 'Employees' : 'Contractors'}
                </button>
              ))}
            </div>

            <div className="flex w-fit items-center gap-2 rounded-lg border bg-white px-4 py-1">
              <Users size={16} className="text-teal-600" />
              <span className="text-sm text-gray-600">
                Total {section === 'employee' ? 'employees' : 'contractors'}:
              </span>
              <span className="text-sm font-semibold text-gray-900">{totalItems}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPageNumber(1);
              }}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            {''}
            Show deleted users
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-700">Error loading employees</p>
          <p className="mt-2 text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-700">
          Loading employees...
        </div>
      )}

      {!loading && employees.length === 0 && (
        <div className="mt-6 rounded-lg border bg-gray-50 p-6 text-center">No employees found.</div>
      )}

      {!loading && employees.length > 0 && (
        <>
          <div className="rounded-lg border bg-white">
            <div className="max-h-140 overflow-x-auto overflow-y-auto">
              <table className="min-w-full">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    {['Name', 'Emp code', 'Email ID', 'Phone', 'Role', 'Status', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((emp) => {
                    const isDeleted = emp.deleted === 1;
                    const status = emp.status ?? -1;
                    const isActive = Number(emp.is_active) === 1;
                    const isXEmployee = status === UserStatusEnum.XEmployee;

                    return (
                      <tr key={emp.id} className={isDeleted ? 'bg-gray-50 opacity-70' : ''}>
                        <td
                          className={`px-6 py-4 whitespace-nowrap ${
                            isDeleted ? 'text-gray-500 line-through' : ''
                          }`}
                        >
                          {emp.display_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{emp.user_code}</td>
                        <td className="px-6 py-4">
                          <span title={emp.email_id || ''} className="block max-w-45 truncate">
                            {emp.email_id || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {emp.phone_number ? `${emp.dial_code || ''} ${emp.phone_number}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{emp.role_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getEmployeeStatusBadgeClass(
                              status,
                              emp.deleted,
                            )}`}
                          >
                            {getEmployeeStatusLabel(status, emp.deleted)}
                          </span>
                          {!isActive && !isXEmployee && (
                            <span className="ml-1.5 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={(e) => toggleMenu(emp.id, e)}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                            aria-label="Employee actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

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

                return (
                  <div
                    ref={menuRef}
                    style={{ position: 'absolute', top: openMenu.top, left: openMenu.left }}
                    className="z-50 w-56 rounded-lg border bg-white py-1 shadow-lg"
                  >
                    {isDeleted ? (
                      <span className="block px-4 py-2 text-xs text-gray-400">
                        Deleted user — no actions
                      </span>
                    ) : (
                      <>
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
                            onClick={() => handleDeactivate(emp)}
                          />
                        )}
                        <MenuItem
                          icon={<Phone className="h-4 w-4" />}
                          label="Change phone number"
                          onClick={() => {
                            setModal({ type: 'phone', emp });
                            setOpenMenu(null);
                          }}
                        />
                        <MenuItem
                          icon={<Hash className="h-4 w-4" />}
                          label="Change employee code"
                          onClick={() => {
                            setModal({ type: 'code', emp });
                            setOpenMenu(null);
                          }}
                        />
                        <MenuItem
                          icon={<Pencil className="h-4 w-4" />}
                          label="Edit basic details"
                          onClick={() => {
                            setModal({ type: 'details', emp });
                            setOpenMenu(null);
                          }}
                        />
                        <MenuItem
                          icon={<ShieldCheck className="h-4 w-4" />}
                          label="Change role"
                          onClick={() => {
                            setModal({ type: 'role', emp });
                            setOpenMenu(null);
                          }}
                        />
                        {offboardable && !isXEmployee && (
                          <MenuItem
                            icon={<LogOut className="h-4 w-4" />}
                            label="Delete employee"
                            danger
                            onClick={() => handleOffboard(emp)}
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

          <div className="mt-6 flex justify-between text-sm text-gray-600">
            <span>
              Page {pageNumber} of {Math.max(1, Math.ceil(totalItems / pageSize))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pageNumber === 1}
                onClick={() => setPageNumber((p) => p - 1)}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={pageNumber >= Math.ceil(totalItems / pageSize)}
                onClick={() => setPageNumber((p) => p + 1)}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
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

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
        danger ? 'text-red-600' : 'text-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  error,
}: Readonly<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  error: string | null;
}>) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
        {children}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
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
  onConfirmOffboard: (emp: Employee, exitDate?: number) => void;
  onConfirmDeactivate: (emp: Employee) => void;
  onSavePhone: (emp: Employee, dialCode: string, phoneNumber: string) => void;
  onSaveCode: (emp: Employee, userCode: string, codePrefix?: string) => void;
  onSaveDetails: (
    emp: Employee,
    body: { firstName?: string; lastName?: string; emailId?: string; address?: string },
  ) => void;
  onSaveRole: (emp: Employee, roleId: string, roleType: number, typeId: number) => void;
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

  // ---- Role modal state ----
  const [roleId, setRoleId] = useState(modal.emp.role_id || '');
  const [typeId, setTypeId] = useState<number | ''>(
    (modal.emp as any).employeeTypeId !== undefined
      ? Number((modal.emp as any).employeeTypeId)
      : '',
  );
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

  if (modal.type === 'confirm-offboard') {
    return (
      <ModalShell title="Offboard employee" onClose={onClose} error={error}>
        <p className="mb-4 text-sm text-gray-600">
          This will mark <strong>{modal.emp.display_name}</strong> as an ex-employee and deactivate
          their account. This can be reviewed later but is a significant action.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirmOffboard(modal.emp)}
          className="w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Offboarding…' : 'Confirm offboard'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'confirm-deactivate') {
    return (
      <ModalShell title="Deactivate employee" onClose={onClose} error={error}>
        <p className="mb-4 text-sm text-gray-600">
          <strong>{modal.emp.display_name}</strong> will lose access immediately. You can reactivate
          them later from this same menu.
        </p>
        <button
          disabled={busy}
          onClick={() => onConfirmDeactivate(modal.emp)}
          className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? 'Deactivating…' : 'Confirm deactivate'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'phone') {
    return (
      <ModalShell title="Change phone number" onClose={onClose} error={error}>
        <div className="mb-3 flex gap-2">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className="w-32 rounded border px-2 py-2 text-sm"
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
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={busy}
          onClick={() => onSavePhone(modal.emp, dialCode, phoneNumber)}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save phone number'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'code') {
    return (
      <ModalShell title="Change employee code" onClose={onClose} error={error}>
        <input
          value={codePrefix}
          onChange={(e) => setCodePrefix(e.target.value)}
          placeholder="Code prefix (optional, e.g. EMP2026)"
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        />
        <input
          value={userCode}
          onChange={(e) => setUserCode(e.target.value)}
          placeholder="Code number (e.g. 0011)"
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          onClick={() => onSaveCode(modal.emp, userCode, codePrefix || undefined)}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save code'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'details') {
    return (
      <ModalShell title="Edit basic details" onClose={onClose} error={error}>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        />
        <input
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          placeholder="Email"
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          onClick={() => onSaveDetails(modal.emp, { firstName, lastName, emailId })}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </ModalShell>
    );
  }

  if (modal.type === 'role') {
    // Treat missing/undefined the same as null (unlocked) — don't let a
    // backend response that omits type_id silently empty the whole list.
    const isUnlocked = (r: RoleOption) => r.type_id === null || r.type_id === undefined;

    const rolesForType = roles.filter(
      (r) => typeId === '' || isUnlocked(r) || r.type_id === typeId,
    );

    return (
      <ModalShell title="Change role" onClose={onClose} error={error || rolesError}>
        <label className="mb-1 block text-xs font-medium text-gray-500">User type</label>
        <select
          value={typeId}
          onChange={(e) => {
            const next = e.target.value === '' ? '' : Number(e.target.value);
            setTypeId(next);
            setRoleId('');
          }}
          disabled={rolesLoading}
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
        >
          <option value="">Select user type…</option>
          {USER_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-gray-500">Role</label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          disabled={rolesLoading || typeId === ''}
          className="mb-3 w-full rounded border px-3 py-2 text-sm"
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
          disabled={busy || !roleId || typeId === ''}
          onClick={() => {
            const selected = roles.find((r) => r.id === roleId);
            if (selected && typeId !== '') {
              onSaveRole(modal.emp, selected.id, selected.role_type, typeId);
            }
          }}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save role'}
        </button>
      </ModalShell>
    );
  }

  return null;
}
