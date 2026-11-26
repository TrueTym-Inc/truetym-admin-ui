import {
  EmployeeListParams,
  EmployeeListResponse,
  EmployeesResponse,
  RoleOption,
} from '@/types/employee';
import { getHeaders } from '@/lib/api';
import { API_BASE_URL } from '@/lib/endpoint';
import { getJson, putJson } from '@/lib/http-client';

// ---------------------------------------------------------------------------
// UserStatusEnum (matches your backend constant)
// ---------------------------------------------------------------------------
export const UserStatusEnum = {
  InvitationSent: 100,
  Registered: 101,
  XEmployee: 102,
} as const;

export function getUserStatusLabel(status: number): string {
  switch (status) {
    case UserStatusEnum.InvitationSent:
      return 'Invited';
    case UserStatusEnum.Registered:
      return 'Active';
    case UserStatusEnum.XEmployee:
      return 'Offboarded';
    default:
      return 'Unknown';
  }
}

/** Tailwind badge classes per status. */
export function getUserStatusBadgeClass(status: number): string {
  switch (status) {
    case UserStatusEnum.Registered:
      return 'bg-green-100 text-green-800';
    case UserStatusEnum.InvitationSent:
      return 'bg-amber-100 text-amber-800';
    case UserStatusEnum.XEmployee:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// ---- deleted-aware variants (deleted = 1 overrides status) -----------------
export function getEmployeeStatusLabel(status: number, deleted?: number): string {
  return deleted === 1 ? 'Deleted' : getUserStatusLabel(status);
}

export function getEmployeeStatusBadgeClass(status: number, deleted?: number): string {
  return deleted === 1 ? 'bg-gray-800 text-white' : getUserStatusBadgeClass(status);
}

/** Only invitation-sent and ex-employees are offboardable from this screen. */
export function isOffboardableEmployee(status: number): boolean {
  return status === UserStatusEnum.InvitationSent || status === UserStatusEnum.XEmployee;
}

/** Deleted users are always offboardable (prime cleanup targets). */
export function canOffboardEmployee(status: number, deleted?: number): boolean {
  return deleted === 1 || isOffboardableEmployee(status);
}

// ---------------------------------------------------------------------------
// GET /organisations/:orgId/employees
// ---------------------------------------------------------------------------
// Legacy list. The admin Employees screen uses fetchAdminEmployees (below) instead.
export interface FetchEmployeesOptions {
  /** 'employee' → types 100 + 103 (default), 'contractor' → 101 + 102 */
  employeeSection?: 'employee' | 'contractor';
}

export async function fetchEmployees(
  organizationId: string,
  pageNumber: number = 1,
  pageSize: number = 10,
  code: string = '',
  name: string = '',
  email: string = '',
  fieldName: string = '',
  orderBy: string = 'ASC',
  status: string = '',
  p0: any = 0,
  options: FetchEmployeesOptions = {},
): Promise<EmployeesResponse> {
  try {
    const params = new URLSearchParams({
      code,
      name,
      email,
      fieldName,
      orderBy,
      status,
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString(),
      delete: String(p0),
      employeeSection: options.employeeSection ?? 'employee',
    });

    const url = `${API_BASE_URL}/organisations/${organizationId}/employees?${params.toString()}`;

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
    console.error('fetchEmployees error:', errorMessage);
    throw new Error(`Failed to fetch employees: ${errorMessage}`);
  }
}

// ---------------------------------------------------------------------------
// GET /organisations/:orgId/employees/admin-list  (admin panel list)
// ---------------------------------------------------------------------------
export interface AdminEmployeeListParams {
  pageNumber: number;
  pageSize: number;
  /** Matches name, email, phone, employee code */
  search?: string;
  /** 100 = Employees tab (100 + 103), 101 = Contractors tab (101 + 102) */
  type?: 100 | 101;
  /** UserStatusEnum: 100 Invited, 101 Active, 102 Offboarded. Omit for all. */
  status?: number | '';
  includeDeleted?: boolean;
  fieldName?: 'created_at' | 'joining_date' | 'display_name' | 'user_code';
  orderBy?: 'ASC' | 'DESC';
}

export async function fetchAdminEmployees(
  organizationId: string,
  p: AdminEmployeeListParams,
): Promise<EmployeesResponse> {
  const qs = new URLSearchParams({
    pageNumber: String(p.pageNumber),
    pageSize: String(p.pageSize),
    search: p.search?.trim() ?? '',
    type: p.type ? String(p.type) : '',
    status: p.status === undefined || p.status === '' ? '' : String(p.status),
    delete: String(Boolean(p.includeDeleted)),
    fieldName: p.fieldName ?? 'created_at',
    orderBy: p.orderBy ?? 'DESC',
  });

  const response = await fetch(
    `${API_BASE_URL}/organisations/${organizationId}/employees/admin-list?${qs.toString()}`,
    { method: 'GET', headers: getHeaders() },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message?.join(', ') || `Failed to fetch employees (${response.status})`);
  }
  return { ...data, totalItems: Number(data.totalItems ?? 0) };
}

// ---------------------------------------------------------------------------
// GET /organisation/:id/employees
// ---------------------------------------------------------------------------
export async function fetchEmployeeList(
  organisationId: string,
  params: EmployeeListParams,
): Promise<EmployeeListResponse> {
  try {
    const qs = new URLSearchParams({
      pageNumber: String(params.pageNumber),
      pageSize: String(params.pageSize),
      name: params.name ?? '',
      email: params.email ?? '',
      code: params.code ?? '',
      status: params.status === undefined ? '' : String(params.status),
      fieldName: params.fieldName ?? '',
      orderBy: params.orderBy ?? '',
    });

    // Adjust the prefix if your organisation controller uses a different path.
    const url = `${API_BASE_URL}/organisation/${organisationId}/employees?${qs.toString()}`;

    const response = await fetch(url, { method: 'GET', headers: getHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { ...data, totalItems: Number(data.totalItems ?? 0) } as EmployeeListResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('fetchEmployeeList error:', errorMessage);
    throw new Error(`Failed to fetch employees: ${errorMessage}`);
  }
}

async function adminAction(url: string, method: 'PATCH' | 'POST' | 'PUT', body?: unknown) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || !data.succeeded) {
    throw new Error(data?.message?.join(', ') || `Request failed (${response.status})`);
  }
  return data;
}

export const updateEmployeePhone = (
  orgId: string,
  empId: string,
  dialCode: string,
  phoneNumber: string,
) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/phone-number`, 'PATCH', {
    dial_code: dialCode,
    phone_number: phoneNumber,
  });

export const changeEmployeeCode = (
  orgId: string,
  empId: string,
  userCode: string,
  codePrefix?: string,
) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/code`, 'PATCH', {
    user_code: userCode,
    code_prefix: codePrefix,
  });

export const activateEmployee = (orgId: string, empId: string) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/activate`, 'PATCH');

export const deactivateEmployee = (orgId: string, empId: string) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/deactivate`, 'PATCH');

export const offboardEmployeeAdmin = (
  orgId: string,
  empId: string,
  exitDate?: number,
  reason?: string,
) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/offboard`, 'PATCH', { exitDate, reason });

export const createEmployeeContext = (orgId: string, empId: string) =>
  adminAction(`/organisations/${orgId}/employees/${empId}/context`, 'POST');

export const updateEmployeeRole = (
  orgId: string,
  employeeId: string,
  roleId: string,
  roleType: number,
  typeId: number,
) =>
  putJson(`/organisations/${orgId}/employees/${employeeId}/role`, {
    roleId,
    roleType,
    typeId,
  });

export const updateEmployeeBasicDetails = (
  orgId: string,
  empId: string,
  body: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    emailId?: string;
    dob?: number;
    gender?: number;
    address?: string;
  },
) => adminAction(`/organisations/${orgId}/employees/${empId}/basic-details`, 'PUT', body);

export async function fetchAssignableRoles(orgId: string): Promise<RoleOption[]> {
  const envelope = await getJson<RoleOption[]>(`/organisations/${orgId}/roles`);
  return envelope.data;
}
