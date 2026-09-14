export interface Employee {
  id: string;
  code_prefix?: string;
  user_code: string;
  employeeTypeId: number;
  display_name: string;
  email_id: string;
  dial_code: string;
  phone_number: string;
  profile_image: string | null;
  joining_date: string;
  status: number;
  is_active: number;
  is_active_organisation?: number;
  deleted: number;
  has_context: number; // 0 | 1 — from getEmployeeList
  job_title: string | null;
  role_id: string | null;
  role_type: number | null;
  role_name: string | null;
}

export interface EmployeesResponse {
  message: string[];
  succeeded: boolean;
  totalItems: string | number;
  data: Employee[];
}

export interface RoleOption {
  id: string;
  role_name: string;
  role_type: number;
  type_id?: number | null;
}

export interface EmployeeListItem {
  id: string;
  user_code: string;
  employeeTypeId: number;
  display_name: string;
  email_id: string;
  dial_code: string;
  phone_number: string;
  profile_image: string;
  joining_date: string;
  status: number;
  is_active: number;
  deleted: number;
  job_title: string;
  role_id: string | null;
  role_type: number | null;
  role_name: string | null;
}

export interface EmployeeListResponse {
  succeeded: boolean;
  message: string[];
  totalItems: number;
  data: EmployeeListItem[];
}

export interface EmployeeListParams {
  pageNumber: number;
  pageSize: number;
  name?: string;
  email?: string;
  code?: string;
  status?: number | '';
  fieldName?: string;
  orderBy?: string;
}
