export type UserRole = 'ADMIN' | 'FIELD_ASSISTANT';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface Employee {
  id: number;
  employee_id: string;
  full_name: string;
  phone: string;
  division?: string;
  district?: string;
  upazila?: string;
  department?: number;
  department_name?: string;
  project?: number;
  project_name?: string;
  designation: string;
  joining_date: string;
  is_active: boolean;
  deactivated_at?: string | null;
  email?: string;
  username?: string;
  role?: UserRole;
}

export interface MeSettings {
  work_start_time: string;
  work_end_time: string;
  late_grace_minutes: number;
  timezone: string;
  require_gps: boolean;
  enforce_geofence: boolean;
}

export interface MeResponse {
  user: User;
  employee: Employee | null;
  settings: MeSettings;
}

export interface Project {
  id: number;
  name: string;
  code: string;
  description?: string;
  division?: string;
  district?: string;
  upazila?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  radius_meters: number;
  is_active: boolean;
  created_at?: string;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  created_at?: string;
}

export type AttendanceType = 'AUTOMATIC' | 'MANUAL';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'INCOMPLETE' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

export interface Attendance {
  id: number;
  employee: number;
  employee_id: string;
  employee_name: string;
  department_name: string;
  project_name?: string;
  employee_division?: string;
  employee_district?: string;
  employee_upazila?: string;
  attendance_date: string;
  check_in_time: string;
  check_out_time: string | null;
  check_in_display: string;
  check_out_display: string;
  working_duration_minutes: number | null;
  working_duration_display: string;
  attendance_type: AttendanceType;
  status: AttendanceStatus;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_accuracy?: number | null;
  check_in_distance_meters?: number | null;
  check_in_is_geofence_violation?: boolean;
  check_in_address?: string;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_accuracy?: number | null;
  check_out_distance_meters?: number | null;
  check_out_is_geofence_violation?: boolean;
  check_out_address?: string;
  approved_by?: number | null;
  approved_by_username?: string;
  approved_at?: string | null;
  admin_remarks?: string;
  manual_request?: number | null;
  created_at: string;
  updated_at: string;
}

export interface MissedCheckout {
  count: number;
  attendance_date: string;
  check_in_time: string;
  check_in_display: string;
  attendance_id: number;
}

export interface TodayAttendanceResponse {
  server_datetime: string;
  server_date: string;
  server_time_display: string;
  is_checked_in: boolean;
  is_checked_out: boolean;
  live_duration_minutes: number | null;
  live_duration_display: string;
  missed_checkout: MissedCheckout | null;
  attendance: Attendance | null;
}

export type ManualRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ManualAttendanceRequest {
  id: number;
  employee: number;
  employee_id: string;
  employee_name: string;
  department_name: string;
  attendance_date: string;
  requested_check_in: string;
  requested_check_out: string;
  requested_check_in_display: string;
  requested_check_out_display: string;
  reason: string;
  remarks?: string;
  status: ManualRequestStatus;
  reviewed_by?: number | null;
  reviewed_by_username?: string;
  reviewed_at?: string | null;
  admin_remarks?: string;
  created_at: string;
}

export type LeaveType = 'CASUAL' | 'SICK' | 'EMERGENCY' | 'EARNED' | 'MATERNITY' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveRequest {
  id: number;
  employee: number;
  employee_id: string;
  employee_name: string;
  department_name: string;
  leave_type: LeaveType;
  leave_type_display: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: LeaveStatus;
  status_display: string;
  reviewed_by?: number | null;
  reviewed_by_username?: string;
  reviewed_at?: string | null;
  admin_remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  description: string;
  is_recurring: boolean;
  created_at: string;
}

export interface DashboardSummary {
  date: string;
  total_assistants: number;
  present: number;
  late: number;
  on_leave: number;
  holiday: number;
  absent: number;
  checked_in: number;
  checked_out: number;
  on_duty?: number;
  incomplete: number;
  geofence_violations: number;
  pending_manual_requests: number;
  filtered_count: number;
}

export interface DailyReportRecord {
  employee_id: string;
  employee_name: string;
  department: string;
  project?: string;
  district?: string;
  division?: string;
  upazila?: string;
  designation: string;
  check_in: string;
  check_out: string;
  duration: string;
  duration_minutes: number;
  type: string;
  status: string;
  approved_by: string;
  remarks: string;
  is_on_duty?: boolean;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_accuracy?: number | null;
  check_in_distance_meters?: number | null;
  check_in_is_geofence_violation?: boolean;
  check_in_address?: string;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_accuracy?: number | null;
  check_out_distance_meters?: number | null;
  check_out_is_geofence_violation?: boolean;
  check_out_address?: string;
}

export interface DailyReportResponse {
  summary: DashboardSummary;
  records: DailyReportRecord[];
}

export interface DayMetadata {
  day: number;
  date: string;
  weekday: string;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name?: string;
}

export interface DailyAttendanceItem {
  day: number;
  date: string;
  weekday: string;
  status: string;
  code: string;
  label: string;
  check_in: string;
  check_out: string;
  duration: string;
  duration_minutes: number;
  type: string;
  is_geofence_violation?: boolean;
  check_in_address?: string;
  check_out_address?: string;
  remarks?: string;
}

export interface MonthlyReportRecord {
  employee_id: string;
  employee_name: string;
  department: string;
  project?: string;
  designation: string;
  present_days: number;
  late_days: number;
  leave_days: number;
  holiday_days: number;
  weekend_days?: number;
  absent_days: number;
  manual_days: number;
  geofence_violations: number;
  total_working_hours: string;
  total_working_minutes: number;
  days?: DailyAttendanceItem[];
}

export interface MonthlyReportResponse {
  year: number;
  month: number;
  total_days?: number;
  days_metadata?: DayMetadata[];
  total_holidays: number;
  total_employees: number;
  records: MonthlyReportRecord[];
}

export interface AuditLog {
  id: number;
  user: number | null;
  username: string;
  role: string;
  action: string;
  object_type: string;
  object_id: string;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
  previous_state?: any;
  new_state?: any;
  remarks?: string;
}

export interface AttendanceSetting {
  id: number;
  work_start_time: string;
  work_end_time: string;
  late_grace_minutes: number;
  half_day_minimum_minutes: number;
  full_day_minimum_minutes: number;
  timezone: string;
  require_gps: boolean;
  enforce_geofence: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface DistrictFAEmployee {
  id: number;
  employee_id: string;
  full_name: string;
  designation: string;
  department: string;
  project: string;
  upazila: string;
  phone: string;
  status: string;
  check_in: string;
  check_out: string;
  punch_address?: string;
  is_violation: boolean;
}

export interface DistrictSummaryItem {
  district: string;
  division: string;
  lat: number;
  lon: number;
  total_fas: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  violation_count: number;
  employees: DistrictFAEmployee[];
  upazilas: string[];
}

export interface DistrictWiseSummaryResponse {
  date: string;
  total_districts: number;
  total_active_fas: number;
  unassigned_count: number;
  unassigned_employees: DistrictFAEmployee[];
  districts: DistrictSummaryItem[];
}
