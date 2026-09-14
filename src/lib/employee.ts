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
// GET /organisation/employees
// ---------------------------------------------------------------------------
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
): Promise<EmployeesResponse> {
  try {
    const params = new URLSearchParams({
      code: code,
      name: name,
      email: email,
      fieldName: fieldName,
      orderBy: orderBy,
      status: status,
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString(),
      delete: p0,
    });

    const url = `${API_BASE_URL}/organisations/${organizationId}/employees?${params.toString()}`;
    console.log('Fetching employees from:', url);

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
    console.error('fetchEmployees error:', errorMessage);
    throw new Error(`Failed to fetch employees: ${errorMessage}`);
  }
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
    console.log('Fetching employees at:', url);

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
