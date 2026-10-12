import pytest
import calendar
from datetime import datetime, date, timedelta, time
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import serializers as drf_serializers
from rest_framework import status

from apps.accounts.models import User, Department, Employee, EmployeeType
from apps.attendance.models import Attendance, AttendanceSetting
from apps.requests.models import ManualAttendanceRequest
from apps.requests.services import ManualRequestService
from apps.audit.models import AuditLog
from apps.attendance.services import (
    get_dhaka_datetime, get_dhaka_date, AttendanceService, ConflictException
)
from apps.attendance.approval_services import AttendanceApprovalService
from apps.reports.services import ReportService

@pytest.mark.django_db
class TestFAMSCore:
    def setup_method(self):
        self.client = APIClient()
        # Setting
        self.setting = AttendanceSetting.get_active()
        self.setting.work_start_time = time(9, 0, 0)
        self.setting.late_grace_minutes = 15
        # Pin the working-day calendar so tests do not depend on the real weekday.
        self.setting.work_days = '1,2,3,4,5'
        self.setting.save()

        # Department
        self.dept = Department.objects.create(name="Operations", code="OPS")

        # Employee-type catalog (admins can extend/retire these through the API).
        EmployeeType.objects.get_or_create(code='FIELD_STAFF', defaults={'name': 'Field Staff'})
        EmployeeType.objects.get_or_create(code='INTERN', defaults={'name': 'Intern'})

        # Admin
        self.admin = User.objects.create_superuser(
            username="testadmin",
            password="adminpassword",
            email="admin@test.com",
            role=User.Role.ADMIN
        )

        # Field Assistant
        self.user_fa = User.objects.create_user(
            username="testfa",
            password="fapassword",
            email="fa@test.com",
            role=User.Role.FIELD_ASSISTANT
        )
        self.employee = Employee.objects.create(
            user=self.user_fa,
            employee_id="FA-TEST",
            full_name="Test Assistant",
            phone="+8801700000000",
            department=self.dept,
            is_active=True
        )

    def test_admin_login_and_jwt_and_fa_blocked_from_username_login(self):
        # Administrators keep the username/password flow.
        res = self.client.post('/api/v1/auth/login/', {
            'username': 'testadmin',
            'password': 'adminpassword'
        })
        assert res.status_code == status.HTTP_200_OK
        assert 'access' in res.data
        assert 'refresh' in res.data
        assert res.data['user']['role'] == User.Role.ADMIN

        # Field Assistants must use the dedicated Employee ID + password flow.
        res_fa = self.client.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'fapassword'
        })
        assert res_fa.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Employee ID and password' in str(res_fa.data)

    def test_fa_login_with_employee_id_and_password(self):
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'fapassword'
        })
        assert res.status_code == status.HTTP_200_OK
        assert 'access' in res.data
        assert 'refresh' in res.data
        assert 'settings' in res.data
        assert res.data['employee']['employee_id'] == "FA-TEST"
        assert AuditLog.objects.filter(action='FA_LOGIN').exists()

    def test_fa_login_employee_id_is_case_insensitive(self):
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'fa-test',
            'password': 'fapassword'
        })
        assert res.status_code == status.HTTP_200_OK

    def test_fa_login_requires_password(self):
        no_pw = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST'
        })
        assert no_pw.status_code == status.HTTP_400_BAD_REQUEST

    def test_fa_login_rejects_unknown_employee(self):
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'NOPE-1',
            'password': 'whatever@123'
        })
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert AuditLog.objects.filter(action='FA_LOGIN_FAILED').exists()

    def test_fa_login_rejects_wrong_password(self):
        for _ in range(3):
            res = self.client.post('/api/v1/auth/fa-login/', {
                'employee_id': 'FA-TEST',
                'password': 'wrongpassword@1'
            })
            assert res.status_code == status.HTTP_400_BAD_REQUEST

        # A correct password restores access immediately.
        ok = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'fapassword'
        })
        assert ok.status_code == status.HTTP_200_OK

    def test_fa_login_rejects_inactive_employee(self):
        self.employee.deactivate()
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'fapassword'
        })
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_fa_login_rejects_admin(self):
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'testadmin',
            'password': 'adminpassword'
        })
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_check_in_success(self):
        self.client.force_authenticate(user=self.user_fa)
        res = self.client.post('/api/v1/attendance/check-in/')
        assert res.status_code == status.HTTP_201_CREATED
        assert "Check-in successful" in res.data['detail']

        # Verify in DB
        today = get_dhaka_date()
        att = Attendance.objects.filter(employee=self.employee, attendance_date=today).first()
        assert att is not None
        assert att.attendance_type == Attendance.Type.AUTOMATIC
        assert att.check_out_time is None

        # Verify audit log
        log = AuditLog.objects.filter(action='CHECK_IN', object_id=str(att.id)).first()
        assert log is not None
        assert log.user == self.user_fa

    def test_duplicate_check_in_prevention(self):
        self.client.force_authenticate(user=self.user_fa)
        # First check-in
        res1 = self.client.post('/api/v1/attendance/check-in/')
        assert res1.status_code == status.HTTP_201_CREATED

        # Second check-in must fail with 409 Conflict
        res2 = self.client.post('/api/v1/attendance/check-in/')
        assert res2.status_code == status.HTTP_409_CONFLICT
        assert "You have already checked in today" in res2.data['detail']

    def test_check_out_without_check_in_fails(self):
        self.client.force_authenticate(user=self.user_fa)
        res = self.client.post('/api/v1/attendance/check-out/')
        assert res.status_code == status.HTTP_404_NOT_FOUND
        assert "No active attendance record found" in res.data['detail']

    def test_check_out_success_and_duration_calculation(self):
        self.client.force_authenticate(user=self.user_fa)
        self.client.post('/api/v1/attendance/check-in/')

        # Manually backdate check-in time by 2 hours for duration testing
        today = get_dhaka_date()
        att = Attendance.objects.get(employee=self.employee, attendance_date=today)
        att.check_in_time = timezone.now() - timedelta(hours=2)
        att.save()

        res = self.client.post('/api/v1/attendance/check-out/')
        assert res.status_code == status.HTTP_200_OK
        assert "Check-out successful" in res.data['detail']

        att.refresh_from_db()
        assert att.check_out_time is not None
        assert att.working_duration_minutes >= 119  # Approx 120 minutes

        # Second check-out must fail
        res_dup = self.client.post('/api/v1/attendance/check-out/')
        assert res_dup.status_code == status.HTTP_409_CONFLICT
        assert "You have already checked out today" in res_dup.data['detail']

    def test_field_assistant_cannot_access_admin_endpoints(self):
        self.client.force_authenticate(user=self.user_fa)
        # Try accessing admin attendance
        res1 = self.client.get('/api/v1/attendance/admin/all/')
        assert res1.status_code == status.HTTP_403_FORBIDDEN

        # Try accessing admin reports
        res2 = self.client.get('/api/v1/admin/reports/daily/')
        assert res2.status_code == status.HTTP_403_FORBIDDEN

        # Try accessing admin audit logs
        res3 = self.client.get('/api/v1/admin/audit-logs/')
        assert res3.status_code == status.HTTP_403_FORBIDDEN

    def _last_working_day(self, offset_days_back=0):
        """
        The (offset_days_back + 1)-th most recent configured working day.

        Walks back one calendar day at a time and counts working days as it
        goes, so distinct offsets always yield distinct dates. Anchoring at
        (today - offset) and then skipping forward can collapse two offsets onto
        the same day once consecutive calendar days are both working days.
        """
        setting = AttendanceSetting.get_active()
        day = get_dhaka_date()
        remaining = offset_days_back
        for _ in range(400):
            if setting.is_working_day(day):
                if remaining == 0:
                    return day
                remaining -= 1
            day -= timedelta(days=1)
        raise AssertionError("no working day found in 400 days")

    def _at(self, day, hhmm):
        """Timezone-aware timestamp for `hhmm` (e.g. '09:00') on the given day."""
        return timezone.make_aware(
            datetime.combine(day, datetime.strptime(hhmm, '%H:%M').time()),
            timezone.get_current_timezone()
        )

    def test_manual_attendance_workflow(self):
        self.client.force_authenticate(user=self.user_fa)
        # Must be a working day: nothing was missed on a non-working day.
        duty_day = self._last_working_day(1)
        check_in = self._at(duty_day, '09:00')
        check_out = self._at(duty_day, '17:00')

        # 1. Submit manual request
        res = self.client.post('/api/v1/manual-requests/', {
            'attendance_date': str(duty_day),
            'requested_check_in': check_in.isoformat(),
            'requested_check_out': check_out.isoformat(),
            'reason': 'Surveying in remote region without cellular data connectivity.'
        })
        assert res.status_code == status.HTTP_201_CREATED
        req_id = res.data['request']['id']

        # 2. Prevent duplicate pending request
        res_dup = self.client.post('/api/v1/manual-requests/', {
            'attendance_date': str(duty_day),
            'requested_check_in': check_in.isoformat(),
            'requested_check_out': check_out.isoformat(),
            'reason': 'Another reason.'
        })
        assert res_dup.status_code == status.HTTP_409_CONFLICT

        # 3. Admin approves request
        self.client.force_authenticate(user=self.admin)
        res_approve = self.client.post(f'/api/v1/manual-requests/admin/{req_id}/approve/', {
            'admin_remarks': 'Approved after supervisor confirmation.'
        })
        assert res_approve.status_code == status.HTTP_200_OK

        # Verify Attendance record was created with MANUAL type
        att = Attendance.objects.get(employee=self.employee, attendance_date=duty_day)
        assert att.attendance_type == Attendance.Type.MANUAL
        assert att.approved_by == self.admin
        assert "Approved after supervisor" in att.admin_remarks
        assert att.manual_request_id == req_id

        # Verify audit log
        log = AuditLog.objects.filter(action='MANUAL_REQUEST_APPROVED', object_id=str(req_id)).first()
        assert log is not None

    def test_soft_deactivation(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/v1/auth/employees/{self.employee.id}/deactivate/')
        assert res.status_code == status.HTTP_200_OK
        self.employee.refresh_from_db()
        assert self.employee.is_active is False
        assert self.employee.user.is_active is False

        # Attempt to check-in as deactivated employee
        self.client.force_authenticate(user=self.employee.user)
        res_ci = self.client.post('/api/v1/attendance/check-in/')
        assert res_ci.status_code == status.HTTP_403_FORBIDDEN

    def test_reports_and_exports(self):
        self.client.force_authenticate(user=self.admin)

        # Daily report JSON
        res_daily = self.client.get('/api/v1/admin/reports/daily/')
        assert res_daily.status_code == status.HTTP_200_OK
        assert 'summary' in res_daily.data
        assert 'records' in res_daily.data

        # Daily report CSV export
        res_csv = self.client.get('/api/v1/admin/reports/daily/export/?format=csv')
        assert res_csv.status_code == status.HTTP_200_OK
        assert res_csv['Content-Type'] == 'text/csv; charset=utf-8'

        # Daily report XLSX export
        res_xlsx = self.client.get('/api/v1/admin/reports/daily/export/?format=xlsx')
        assert res_xlsx.status_code == status.HTTP_200_OK
        assert 'spreadsheetml' in res_xlsx['Content-Type']

        # Monthly report
        res_monthly = self.client.get('/api/v1/admin/reports/monthly/')
        assert res_monthly.status_code == status.HTTP_200_OK
        assert 'records' in res_monthly.data

        # Individual Employee report
        res_emp = self.client.get(f'/api/v1/admin/reports/employee/{self.employee.employee_id}/')
        assert res_emp.status_code == status.HTTP_200_OK
        assert res_emp.data['employee']['employee_id'] == self.employee.employee_id

    def test_gps_checkin_captures_coordinates(self):
        # Geolocation is off by default and toggled from the admin dashboard;
        # enable it here to exercise the coordinate capture pipeline.
        self.setting.require_gps = True
        self.setting.save()

        self.client.force_authenticate(user=self.user_fa)

        res = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8105,
            'longitude': 90.4127,
            'accuracy': 10.5
        })
        assert res.status_code == status.HTTP_201_CREATED
        att = Attendance.objects.get(id=res.data['attendance']['id'])
        assert att.check_in_latitude is not None
        assert att.check_in_longitude is not None
        assert att.check_in_accuracy == 10.5

    def test_leave_and_holiday_workflow(self):
        from apps.leaves.models import Holiday, LeaveRequest

        # Field assistant applies for leave
        self.client.force_authenticate(user=self.user_fa)
        res = self.client.post('/api/v1/leaves/apply/', {
            'leave_type': 'SICK',
            'start_date': '2026-10-01',
            'end_date': '2026-10-03',
            'reason': 'Medical recovery after fever'
        })
        assert res.status_code == status.HTTP_201_CREATED
        leave_id = res.data['leave_request']['id']
        assert res.data['leave_request']['total_days'] == 3

        # Admin reviews and approves
        self.client.force_authenticate(user=self.admin)
        res_appr = self.client.post(f'/api/v1/leaves/admin/requests/{leave_id}/approve/', {
            'admin_remarks': 'Approved, get well soon'
        })
        assert res_appr.status_code == status.HTTP_200_OK
        assert res_appr.data['leave_request']['status'] == 'APPROVED'

        # Verify daily report for leave date reflects ON_LEAVE
        res_rep = self.client.get('/api/v1/admin/reports/daily/?date=2026-10-02')
        assert res_rep.status_code == status.HTTP_200_OK
        record = next((r for r in res_rep.data['records'] if r['employee_id'] == self.employee.employee_id), None)
        assert record is not None
        assert record['status'] == 'ON_LEAVE'

    def test_real_location_tracking_at_check_in_and_check_out(self):
        # Geolocation is off by default; enable it to exercise address capture.
        self.setting.require_gps = True
        self.setting.save()

        self.client.force_authenticate(user=self.user_fa)

        # Check in with real GPS
        res_in = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8103,
            'longitude': 90.4125,
            'accuracy': 12.5,
            'address': 'DOHS Baridhara, Dhaka'
        })
        assert res_in.status_code == status.HTTP_201_CREATED
        att_data = res_in.data['attendance']
        assert float(att_data['check_in_latitude']) == 23.8103
        assert float(att_data['check_in_longitude']) == 90.4125
        assert att_data['check_in_address'] == 'DOHS Baridhara, Dhaka'

        # Check out with real GPS
        res_out = self.client.post('/api/v1/attendance/check-out/', {
            'latitude': 23.7925,
            'longitude': 90.4078,
            'accuracy': 15.0,
            'address': 'Gulshan-2, Dhaka'
        })
        assert res_out.status_code == status.HTTP_200_OK
        att_out_data = res_out.data['attendance']
        assert float(att_out_data['check_out_latitude']) == 23.7925
        assert float(att_out_data['check_out_longitude']) == 90.4078
        assert att_out_data['check_out_address'] == 'Gulshan-2, Dhaka'

        # Admin views daily report
        self.client.force_authenticate(user=self.admin)
        res_rep = self.client.get('/api/v1/admin/reports/daily/')
        assert res_rep.status_code == status.HTTP_200_OK
        rec = next(r for r in res_rep.data['records'] if r['employee_id'] == self.employee.employee_id)
        assert rec['check_in_address'] == 'DOHS Baridhara, Dhaka'
        assert rec['check_out_address'] == 'Gulshan-2, Dhaka'
        assert rec['check_in_latitude'] == 23.8103
        assert rec['check_out_latitude'] == 23.7925

        # Admin exports daily report CSV and checks headers & location content
        res_csv = self.client.get('/api/v1/admin/reports/daily/export/?format=csv')
        assert res_csv.status_code == status.HTTP_200_OK
        content = res_csv.content.decode('utf-8')
        assert 'Check In Location' in content
        assert 'Check Out Location' in content
        assert 'DOHS Baridhara, Dhaka' in content
        assert 'Gulshan-2, Dhaka' in content

    def test_employee_type_assignment_and_filtering(self):
        """
        Verify that admin can classify employees as Field Staff or Intern and
        that the employee list can be filtered by employee_type.
        """
        self.client.force_authenticate(user=self.admin)

        # 1. Create an Intern
        res_emp = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'INT-GZP-01',
            'full_name': 'Hasan Mahmud',
            'username': 'hasan_intern',
            'password': 'Secure@123',
            'employee_type': 'INTERN',
            'role': 'FIELD_ASSISTANT'
        })
        assert res_emp.status_code == status.HTTP_201_CREATED
        assert res_emp.data['employee_type'] == 'INTERN'
        assert res_emp.data['employee_type_display'] == 'Intern'

        # 2. Create a Field Staff member
        res_staff = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'FS-GZP-01',
            'full_name': 'Karim Uddin',
            'username': 'karim_staff',
            'password': 'Secure@123',
            'employee_type': 'FIELD_STAFF',
            'role': 'FIELD_ASSISTANT'
        })
        assert res_staff.status_code == status.HTTP_201_CREATED

        # 2b. A weak password is rejected by the secure-password policy.
        res_weak = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'WEAK-GZP-01',
            'full_name': 'Weak Admin',
            'username': 'weak_user',
            'password': 'password123',
            'employee_type': 'FIELD_STAFF',
            'role': 'FIELD_ASSISTANT'
        })
        assert res_weak.status_code == status.HTTP_400_BAD_REQUEST

        # 3. Filter the employee list by employee_type
        res_interns = self.client.get('/api/v1/auth/employees/?employee_type=INTERN')
        assert res_interns.status_code == status.HTTP_200_OK
        ids = [e['employee_id'] for e in res_interns.data['results']]
        assert 'INT-GZP-01' in ids
        assert 'FS-GZP-01' not in ids

    def test_employee_type_catalog_admin_crud_and_fa_forbidden(self):
        """Admin can manage the employee-type catalog; Field Assistants cannot."""
        # 1. Field Assistants are locked out of the catalog entirely.
        self.client.force_authenticate(user=self.user_fa)
        assert self.client.get('/api/v1/auth/employee-types/').status_code == status.HTTP_403_FORBIDDEN
        post_fa = self.client.post('/api/v1/auth/employee-types/', {'code': 'X', 'name': 'X'})
        assert post_fa.status_code == status.HTTP_403_FORBIDDEN
        assert self.client.delete('/api/v1/auth/employee-types/1/').status_code == status.HTTP_403_FORBIDDEN

        # 2. Seeded catalog is visible to admins.
        self.client.force_authenticate(user=self.admin)
        res_list = self.client.get('/api/v1/auth/employee-types/')
        assert res_list.status_code == status.HTTP_200_OK
        codes = [t['code'] for t in res_list.data['results']]
        assert 'FIELD_STAFF' in codes and 'INTERN' in codes

        # 3. Admin creates a new type and assigns it to an employee.
        res_create = self.client.post('/api/v1/auth/employee-types/', {
            'code': 'SUPERVISOR', 'name': 'Field Supervisor'
        })
        assert res_create.status_code == status.HTTP_201_CREATED
        assert res_create.data['employee_count'] == 0

        res_emp = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'SUP-GZP-01',
            'full_name': 'Samiul Hoque',
            'username': 'samiul_sup',
            'password': 'Secure@123',
            'employee_type': 'SUPERVISOR',
        })
        assert res_emp.status_code == status.HTTP_201_CREATED
        assert res_emp.data['employee_type'] == 'SUPERVISOR'
        assert res_emp.data['employee_type_display'] == 'Field Supervisor'

        # 4. Edit renames the label everywhere.
        type_id = res_create.data['id']
        res_patch = self.client.patch(f'/api/v1/auth/employee-types/{type_id}/', {'name': 'Senior Supervisor'})
        assert res_patch.status_code == status.HTTP_200_OK
        assert Employee.objects.get(employee_id='SUP-GZP-01').get_employee_type_display() == 'Senior Supervisor'

        # 5. In-use types cannot be hard-deleted.
        res_del_inuse = self.client.delete(f'/api/v1/auth/employee-types/{type_id}/')
        assert res_del_inuse.status_code == status.HTTP_400_BAD_REQUEST
        assert EmployeeType.objects.filter(pk=type_id).exists()

        # 6. Unused types can be deleted; inactive types can't be newly assigned.
        res_inactive = self.client.post('/api/v1/auth/employee-types/', {'code': 'TEMP', 'name': 'Temporary'})
        temp_id = res_inactive.data['id']
        assert self.client.patch(f'/api/v1/auth/employee-types/{temp_id}/', {'is_active': False}).status_code == status.HTTP_200_OK
        res_bad_assign = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'TMP-GZP-01',
            'full_name': 'Temp Worker',
            'username': 'tmp_worker',
            'password': 'Secure@123',
            'employee_type': 'TEMP',
        })
        assert res_bad_assign.status_code == status.HTTP_400_BAD_REQUEST
        assert self.client.delete(f'/api/v1/auth/employee-types/{temp_id}/').status_code == status.HTTP_204_NO_CONTENT

        # 7. Assigning an unknown code is rejected.
        res_unknown = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'BAD-GZP-01',
            'full_name': 'Unknown Type',
            'username': 'bad_type',
            'password': 'Secure@123',
            'employee_type': 'NOT_REAL',
        })
        assert res_unknown.status_code == status.HTTP_400_BAD_REQUEST

    def test_employee_edit_can_update_email_and_joining_date(self):
        """Admin 'all information' edit covers email and joining date."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/auth/employees/{self.employee.id}/', {
            'email': 'new@test.com',
            'joining_date': '2024-06-01',
        })
        assert res.status_code == status.HTTP_200_OK
        self.user_fa.refresh_from_db()
        self.employee.refresh_from_db()
        assert self.user_fa.email == 'new@test.com'
        assert str(self.employee.joining_date) == '2024-06-01'

        # Unknown employee types are still rejected on edit.
        res_bad = self.client.patch(f'/api/v1/auth/employees/{self.employee.id}/', {
            'employee_type': 'BOGUS',
        })
        assert res_bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_admin_reset_employee_password(self):
        """
        Verify that admin can reset an employee's password via detail and quick-reset endpoints,
        and the employee can log in with the new password (Employee ID + password + PIN).
        """
        # 1. Detail reset endpoint
        self.client.force_authenticate(user=self.admin)
        res_reset = self.client.post(f'/api/v1/auth/employees/{self.employee.id}/reset-password/', {
            'new_password': 'Newpass@123'
        })
        assert res_reset.status_code == status.HTTP_200_OK
        assert 'successfully updated' in res_reset.data['detail']

        # Verify login works with new password
        client2 = APIClient()
        res_login = client2.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'Newpass@123',
        })
        assert res_login.status_code == status.HTTP_200_OK

        # 2. Quick reset endpoint using employee_id
        res_quick = self.client.post('/api/v1/auth/employees/quick-reset-password/', {
            'employee_id': self.employee.employee_id,
            'new_password': 'Another@456'
        })
        assert res_quick.status_code == status.HTTP_200_OK

        # Verify login with the quick-reset password
        res_login2 = client2.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'Another@456',
        })
        assert res_login2.status_code == status.HTTP_200_OK

    def test_admin_reset_password_rejects_weak_password(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/v1/auth/employees/{self.employee.id}/reset-password/', {
            'new_password': 'password123'
        })
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        self.user_fa.refresh_from_db()
        assert self.user_fa.check_password('fapassword')

        res_quick = self.client.post('/api/v1/auth/employees/quick-reset-password/', {
            'employee_id': self.employee.employee_id,
            'new_password': 'abcdefgh'
        })
        assert res_quick.status_code == status.HTTP_400_BAD_REQUEST

    def test_admin_reset_duty_for_today(self):
        """
        Verify that an administrator can reset today's duty for a single FA or all FAs,
        clearing their attendance record so they can punch in afresh.
        """
        # 1. FA checks in
        self.client.force_authenticate(user=self.user_fa)
        res_in = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8103,
            'longitude': 90.4125
        })
        assert res_in.status_code == status.HTTP_201_CREATED

        # 2. Non-admin forbidden from resetting duty
        res_forbidden = self.client.post('/api/v1/attendance/admin/reset-duty/', {
            'employee_id': self.employee.employee_id
        })
        assert res_forbidden.status_code == status.HTTP_403_FORBIDDEN

        # 3. Admin resets duty for this specific employee
        self.client.force_authenticate(user=self.admin)
        res_reset = self.client.post('/api/v1/attendance/admin/reset-duty/', {
            'employee_id': self.employee.employee_id
        })
        assert res_reset.status_code == status.HTTP_200_OK
        assert res_reset.data['count'] == 1

        # 4. Verify FA can check in again
        self.client.force_authenticate(user=self.user_fa)
        res_in_again = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8103,
            'longitude': 90.4125
        })
        assert res_in_again.status_code == status.HTTP_201_CREATED

        # 5. Admin resets duty for ALL employees
        self.client.force_authenticate(user=self.admin)
        res_reset_all = self.client.post('/api/v1/attendance/admin/reset-duty/', {
            'employee_id': 'ALL'
        })
        assert res_reset_all.status_code == status.HTTP_200_OK
        assert res_reset_all.data['count'] >= 1

    def test_fa_bulk_upload_and_template(self):
        """
        Verify that admin can download bulk upload templates and upload
        Field Assistants / Interns via CSV and Excel with employee-type
        classification and user creation.
        """
        from django.core.files.uploadedfile import SimpleUploadedFile

        # 1. Non-admin forbidden
        self.client.force_authenticate(user=self.user_fa)
        res_forb = self.client.get('/api/v1/auth/employees/bulk-template/')
        assert res_forb.status_code == status.HTTP_403_FORBIDDEN

        # 2. Admin retrieves Excel and CSV templates
        self.client.force_authenticate(user=self.admin)
        res_xlsx_tpl = self.client.get('/api/v1/auth/employees/bulk-template/')
        assert res_xlsx_tpl.status_code == status.HTTP_200_OK
        assert 'spreadsheetml' in res_xlsx_tpl['Content-Type']
        assert len(res_xlsx_tpl.content) > 1000

        res_csv_tpl = self.client.get('/api/v1/auth/employees/bulk-template/?file_type=csv')
        assert res_csv_tpl.status_code == status.HTTP_200_OK
        assert 'text/csv' in res_csv_tpl['Content-Type']
        assert b'Employee ID' in res_csv_tpl.content

        # 3. Admin bulk uploads FAs via CSV with employee-type assignment
        csv_content = (
            "Employee ID,Full Name,Username,Employee Type,Phone Number,Designation,Password\n"
            "FA-BULK-1,Bulk Assistant One,bulkasst1,Field Staff,01799887766,Field Assistant,Secret@123\n"
            "IN-BULK-2,Bulk Intern Two,bulkintern2,Intern,01899887766,Intern,Secret@123\n"
        ).encode('utf-8')

        csv_file = SimpleUploadedFile("bulk_fas.csv", csv_content, content_type="text/csv")
        res_upload = self.client.post('/api/v1/auth/employees/bulk-upload/', {
            'file': csv_file
        }, format='multipart')

        assert res_upload.status_code == status.HTTP_200_OK
        assert res_upload.data['created_count'] == 2
        assert res_upload.data['failed_count'] == 0

        # Verify created employee profiles in DB
        e1 = Employee.objects.get(employee_id='FA-BULK-1')
        assert e1.full_name == 'Bulk Assistant One'
        assert e1.employee_type == 'FIELD_STAFF'
        assert e1.user.username == 'bulkasst1'

        e2 = Employee.objects.get(employee_id='IN-BULK-2')
        assert e2.employee_type == 'INTERN'

        # Verify login works for bulk created employee (Employee ID + password + PIN)
        client2 = APIClient()
        res_login = client2.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-BULK-1',
            'password': 'Secret@123',
        })
        assert res_login.status_code == status.HTTP_200_OK

        # Weak passwords supplied in the file are rejected per row.
        weak_content = (
            "Employee ID,Full Name,Username,Employee Type,Phone Number,Designation,Password\n"
            "FA-WEAK-1,Weak Bulk User,weakbulk1,Field Staff,01711223300,Field Assistant,password\n"
        ).encode('utf-8')
        weak_file = SimpleUploadedFile("weak.csv", weak_content, content_type="text/csv")
        res_weak = self.client.post('/api/v1/auth/employees/bulk-upload/', {
            'file': weak_file
        }, format='multipart')
        assert res_weak.status_code == status.HTTP_400_BAD_REQUEST
        assert res_weak.data['created_count'] == 0
        assert res_weak.data['failed_count'] == 1
        assert 'Weak password' in res_weak.data['errors'][0]['error']







    def test_refresh_token_rotation_contract(self):
        """
        SIMPLE_JWT runs with ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION.
        The client must persist the rotated refresh token it receives, otherwise the
        next refresh replays a blacklisted token and logs the user out for good.
        Locks that contract so the SPA fix cannot silently regress.
        """
        login = self.client.post('/api/v1/auth/login/', {
            'username': 'testadmin',
            'password': 'adminpassword'
        })
        original_refresh = login.data['refresh']

        rotated = self.client.post('/api/v1/auth/token/refresh/', {
            'refresh': original_refresh
        })
        assert rotated.status_code == status.HTTP_200_OK
        assert 'access' in rotated.data
        # Rotation must hand back a new refresh token for the SPA to persist.
        assert 'refresh' in rotated.data
        assert rotated.data['refresh'] != original_refresh

        # The consumed token is blacklisted, so replaying it must fail.
        replay = self.client.post('/api/v1/auth/token/refresh/', {
            'refresh': original_refresh
        })
        assert replay.status_code == status.HTTP_401_UNAUTHORIZED

        # Following the rotation chain with the new token keeps working.
        chained = self.client.post('/api/v1/auth/token/refresh/', {
            'refresh': rotated.data['refresh']
        })
        assert chained.status_code == status.HTTP_200_OK

    def test_me_endpoint_exposes_gps_flags(self):
        """
        The mobile client needs the server-authoritative GPS flags on boot to decide
        whether to request location permission at all.
        """
        res = self.client.get(
            '/api/v1/auth/me/',
            HTTP_AUTHORIZATION='Bearer ' + self._fa_access()
        )
        assert res.status_code == status.HTTP_200_OK
        assert 'require_gps' in res.data['settings']
        assert res.data['settings']['require_gps'] is False

    def test_admin_can_toggle_require_gps(self):
        """
        require_gps is persisted and audited. Field assistants cannot reach settings.
        """
        res = self.client.patch(
            '/api/v1/attendance/settings/',
            {'require_gps': True},
            format='json',
            HTTP_AUTHORIZATION='Bearer ' + self._admin_access()
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data['require_gps'] is True
        self.setting.refresh_from_db()
        assert self.setting.require_gps is True
        assert AuditLog.objects.filter(action='SETTING_UPDATED').exists()

        # Field assistants cannot reach settings.
        forbidden = self.client.patch(
            '/api/v1/attendance/settings/',
            {'require_gps': False},
            format='json',
            HTTP_AUTHORIZATION='Bearer ' + self._fa_access()
        )
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN

    def test_gps_requirement_enforced_by_setting(self):
        """
        GPS disabled (the default) must allow a punch with no coordinates; enabling
        require_gps must then reject the same empty payload and accept one with
        coordinates.
        """
        headers = {'HTTP_AUTHORIZATION': 'Bearer ' + self._fa_access()}
        today = get_dhaka_date()

        assert self.setting.require_gps is False
        ok = self.client.post('/api/v1/attendance/check-in/', {}, format='json', **headers)
        assert ok.status_code == status.HTTP_201_CREATED
        assert Attendance.objects.filter(
            employee=self.employee, attendance_date=today
        ).exists()

        # Isolate the next attempts from the record just created.
        Attendance.objects.filter(employee=self.employee).delete()

        self.setting.require_gps = True
        self.setting.save()

        blocked = self.client.post('/api/v1/attendance/check-in/', {}, format='json', **headers)
        assert blocked.status_code == status.HTTP_400_BAD_REQUEST
        assert not Attendance.objects.filter(
            employee=self.employee, attendance_date=today
        ).exists()

        allowed = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8103,
            'longitude': 90.4125,
            'accuracy': 15
        }, format='json', **headers)
        assert allowed.status_code == status.HTTP_201_CREATED
        record = Attendance.objects.get(employee=self.employee, attendance_date=today)
        assert record.check_in_latitude is not None

    def _fa_access(self):
        res = self.client.post('/api/v1/auth/fa-login/', {
            'employee_id': 'FA-TEST',
            'password': 'fapassword',
        })
        return res.data['access']

    def _admin_access(self):
        res = self.client.post('/api/v1/auth/login/', {
            'username': 'testadmin',
            'password': 'adminpassword'
        })
        return res.data['access']

    def test_no_missed_checkout_when_duty_is_closed(self):
        """A completed check-in/check-out pair must never raise a warning."""
        headers = {'HTTP_AUTHORIZATION': 'Bearer ' + self._fa_access()}

        res = self.client.post('/api/v1/attendance/check-in/', {}, format='json', **headers)
        assert res.status_code == status.HTTP_201_CREATED

        today = get_dhaka_date()
        # Close it retroactively so today looks like a finished duty day.
        Attendance.objects.filter(employee=self.employee).update(
            check_out_time=timezone.now(),
            working_duration_minutes=480
        )

        summary = AttendanceService.get_today_summary(self.employee)
        assert summary['missed_checkout'] is None

    def test_today_unclosed_is_not_flagged_as_missed(self):
        """
        An assistant still on duty today has an unclosed record, but 11:59 PM has
        not passed, so no warning and no manual request is warranted.
        """
        headers = {'HTTP_AUTHORIZATION': 'Bearer ' + self._fa_access()}
        res = self.client.post('/api/v1/attendance/check-in/', {}, format='json', **headers)
        assert res.status_code == status.HTTP_201_CREATED

        summary = AttendanceService.get_today_summary(self.employee)
        assert summary['is_checked_in'] is True
        assert summary['is_checked_out'] is False
        assert summary['missed_checkout'] is None

    def test_missed_checkout_flagged_after_duty_day_ends(self):
        """
        A duty day checked in but never checked out is reported once its date is
        behind the current Asia/Dhaka date, and the warning clears once an admin
        closes it.
        """
        # Duty day = most recent working day, checked in but never checked out.
        duty_day = self._last_working_day(1)
        stale = Attendance.objects.create(
            employee=self.employee,
            attendance_date=duty_day,
            check_in_time=self._at(duty_day, '09:00'),
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.INCOMPLETE
        )

        summary = AttendanceService.get_today_summary(self.employee)
        missed = summary['missed_checkout']
        assert missed is not None
        assert missed['count'] == 1
        assert missed['attendance_date'] == str(duty_day)
        assert missed['attendance_id'] == stale.id
        assert missed['check_in_display']

        # Surfaced over the API for the assistant's own dashboard.
        headers = {'HTTP_AUTHORIZATION': 'Bearer ' + self._fa_access()}
        res = self.client.get('/api/v1/attendance/today/', **headers)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['missed_checkout']['attendance_date'] == str(duty_day)

        # Once the record is closed the warning disappears.
        stale.check_out_time = timezone.now()
        stale.working_duration_minutes = 480
        stale.save()
        assert AttendanceService.get_today_summary(self.employee)['missed_checkout'] is None

    def test_missed_checkout_reports_only_latest_duty_day(self):
        """
        Only the most recent unclosed duty day raises the warning; older open
        days are not surfaced, so the banner stays scoped to a single day.
        """
        latest_day = self._last_working_day(1)
        older_day = self._last_working_day(3)
        for day in (latest_day, older_day):
            Attendance.objects.create(
                employee=self.employee,
                attendance_date=day,
                check_in_time=self._at(day, '09:00'),
                attendance_type=Attendance.Type.AUTOMATIC,
                status=Attendance.Status.INCOMPLETE
            )

        missed = AttendanceService.get_today_summary(self.employee)['missed_checkout']
        assert missed is not None
        assert missed['count'] == 1
        # Only the most recent duty day is reported.
        assert missed['attendance_date'] == str(latest_day)

        # Closing the latest day clears the banner even though an older day is
        # still open: the warning never trails back into history.
        Attendance.objects.filter(
            employee=self.employee, attendance_date=latest_day
        ).update(check_out_time=timezone.now(), working_duration_minutes=480)
        assert AttendanceService.get_missed_checkout(self.employee) is None

    def test_missed_checkout_is_scoped_to_own_records(self):
        """An assistant is only ever warned about their own unclosed duty days."""
        from apps.accounts.models import User as _User

        other = _User.objects.create_user(
            username="otherfa",
            password="otherpassword",
            role=_User.Role.FIELD_ASSISTANT
        )
        Employee.objects.create(
            user=other,
            employee_id="FA-OTHER",
            full_name="Other Assistant",
            phone="+8801700000099",
            is_active=True
        )
        other_day = self._last_working_day(1)
        Attendance.objects.create(
            employee=other.employee_profile,
            attendance_date=other_day,
            check_in_time=self._at(other_day, '09:00'),
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.INCOMPLETE
        )

        assert AttendanceService.get_missed_checkout(self.employee) is None
        assert AttendanceService.get_missed_checkout(other.employee_profile) is not None

    # ------------------------------------------------------------------
    # Working-day calendar + two-type manual attendance requests
    # ------------------------------------------------------------------

    def _set_work_days(self, raw):
        setting = AttendanceSetting.get_active()
        setting.work_days = raw
        setting.save()
        return setting

    def _make_unclosed_day(self, day, hour=9):
        from datetime import time as _time
        return Attendance.objects.create(
            employee=self.employee,
            attendance_date=day,
            check_in_time=timezone.make_aware(
                datetime.combine(day, _time(hour, 0)), timezone.get_current_timezone()
            ),
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.INCOMPLETE
        )

    def test_work_days_parsing_and_working_day_predicate(self):
        setting = self._set_work_days('1,2,3,4,5')
        assert setting.working_weekdays == (1, 2, 3, 4, 5)
        # 2026-09-25 is a Friday, 2026-09-26 Saturday, 2026-09-27 Sunday.
        assert setting.is_working_day(date(2026, 9, 25))
        assert not setting.is_working_day(date(2026, 9, 26))
        assert not setting.is_working_day(date(2026, 9, 27))

        # A six-day week is honoured when configured.
        setting = self._set_work_days('1,2,3,4,5,6')
        assert setting.is_working_day(date(2026, 9, 26))
        assert not setting.is_working_day(date(2026, 9, 27))

    def test_malformed_work_days_is_rejected(self):
        """
        The working-day calendar is business-critical, so a malformed list must
        never be accepted. Field validators enforce this on full_clean(), and the
        settings serializer enforces it on every API write.
        """
        setting = AttendanceSetting.get_active()
        for bad in ('1,2,x', '9', '1,2,3,4,5,6,7,8'):
            setting.work_days = bad
            with pytest.raises(ValidationError):
                setting.full_clean()
        # A well-formed list still passes.
        setting.work_days = '1,2,3,4,5,6'
        setting.full_clean()

    def test_calendar_days_are_returned_newest_first(self):
        """
        Ordering is part of the response contract, not incidental: a history view
        reads top-down from the present.
        """
        self._set_work_days('1,2,3,4,5')
        today = get_dhaka_date()
        cal = AttendanceService.get_monthly_calendar(self.employee, today.year, today.month)

        dates = [datetime.strptime(d['date'], '%Y-%m-%d').date() for d in cal['days']]
        assert dates == sorted(dates, reverse=True), "calendar days must be newest first"
        assert dates, "expected at least one working day in the current month"

    def test_calendar_flags_missing_check_in_on_past_working_days(self):
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        # Ensure a clean slate for that day.
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()

        cal = AttendanceService.get_monthly_calendar(self.employee, day.year, day.month)
        entry = next(d for d in cal['days'] if d['date'] == str(day))

        assert entry['attendance'] is None
        assert entry['issue'] == 'MISSED_CHECK_IN'
        assert entry['can_request_check_in'] is True
        assert entry['can_request_check_out'] is False

    def test_calendar_lists_every_day_and_offers_requests_only_on_working_days(self):
        """
        The register shows the whole month, so weekly offs and holidays are
        present as rows rather than omitted. A manual attendance request is only
        ever offered for a day the employee actually owed duty for.
        """
        self._set_work_days('1,2,3,4,5')
        today = get_dhaka_date()
        cal = AttendanceService.get_monthly_calendar(self.employee, today.year, today.month)

        setting = AttendanceSetting.get_active()
        expected_days = calendar.monthrange(today.year, today.month)[1]
        assert len(cal['days']) == expected_days, (
            "every calendar day of the month must be listed, not only working days"
        )

        working_seen = 0
        for entry in cal['days']:
            parsed = datetime.strptime(entry['date'], '%Y-%m-%d').date()
            is_working = setting.is_working_day(parsed)
            assert entry['schedule']['is_working'] is is_working

            if is_working:
                working_seen += 1
            else:
                # A day the employee did not owe duty for is never claimable.
                assert entry['issue'] is None, f"{parsed} is not a working day"
                assert entry['can_request_check_in'] is False
                assert entry['can_request_check_out'] is False

            if parsed > today:
                assert entry['is_future'] is True
                assert entry['issue'] is None

        assert working_seen > 0, "expected at least one working day in the current month"

    def test_calendar_flags_missing_check_out_and_clears_after_approval(self):
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()
        rec = self._make_unclosed_day(day, hour=9)

        cal = AttendanceService.get_monthly_calendar(self.employee, day.year, day.month)
        entry = next(d for d in cal['days'] if d['date'] == str(day))
        assert entry['issue'] == 'MISSED_CHECK_OUT'
        assert entry['can_request_check_out'] is True
        assert entry['can_request_check_in'] is False

        req = ManualRequestService.create_request(
            employee=self.employee,
            attendance_date=day,
            request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT,
            requested_check_out=timezone.make_aware(
                datetime.combine(day, datetime.strptime('17:00', '%H:%M').time()),
                timezone.get_current_timezone()
            ),
            reason='Forgot to check out during field duty.'
        )
        # A pending request must suppress the duplicate action.
        cal = AttendanceService.get_monthly_calendar(self.employee, day.year, day.month)
        entry = next(d for d in cal['days'] if d['date'] == str(day))
        assert entry['pending_request_id'] == req.id
        assert entry['can_request_check_out'] is False

        ManualRequestService.approve_request(req.id, self.admin)
        rec.refresh_from_db()
        assert rec.check_out_time is not None
        cal = AttendanceService.get_monthly_calendar(self.employee, day.year, day.month)
        entry = next(d for d in cal['days'] if d['date'] == str(day))
        assert entry['issue'] is None

    def test_check_out_only_request_requires_existing_unclosed_record(self):
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()
        checkout = timezone.make_aware(
            datetime.combine(day, datetime.strptime('17:00', '%H:%M').time()),
            timezone.get_current_timezone()
        )

        # No record at all -> must steer the user to a missed check-in instead.
        with pytest.raises(ConflictException):
            ManualRequestService.create_request(
                employee=self.employee,
                attendance_date=day,
                request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT,
                requested_check_out=checkout,
                reason='x'
            )

        # Record exists but is already closed -> nothing is missing.
        Attendance.objects.create(
            employee=self.employee, attendance_date=day,
            check_in_time=timezone.make_aware(
                datetime.combine(day, datetime.strptime('09:00', '%H:%M').time()),
                timezone.get_current_timezone()
            ),
            check_out_time=checkout, working_duration_minutes=480,
            attendance_type=Attendance.Type.AUTOMATIC, status=Attendance.Status.PRESENT
        )
        with pytest.raises(ConflictException):
            ManualRequestService.create_request(
                employee=self.employee,
                attendance_date=day,
                request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT,
                requested_check_out=checkout,
                reason='x'
            )

    def test_check_out_only_request_preserves_original_check_in(self):
        """
        The core guarantee of a check-out-only request: the server-recorded
        check-in (and its status) must survive approval untouched.
        """
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()

        original_in = timezone.make_aware(
            datetime.combine(day, datetime.strptime('09:07', '%H:%M').time()),
            timezone.get_current_timezone()
        )
        rec = self._make_unclosed_day(day, hour=9)
        rec.check_in_time = original_in
        rec.status = Attendance.Status.LATE
        rec.save()

        requested_out = timezone.make_aware(
            datetime.combine(day, datetime.strptime('17:30', '%H:%M').time()),
            timezone.get_current_timezone()
        )
        req = ManualRequestService.create_request(
            employee=self.employee,
            attendance_date=day,
            request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT,
            requested_check_out=requested_out,
            reason='Forgot to check out during field duty.'
        )
        # A check-out-only request stores no check-in of its own.
        assert req.requested_check_in is None

        ManualRequestService.approve_request(req.id, self.admin)

        rec.refresh_from_db()
        assert rec.check_in_time == original_in
        assert rec.check_out_time == requested_out
        assert rec.status == Attendance.Status.LATE
        assert rec.attendance_type == Attendance.Type.MANUAL
        assert rec.working_duration_minutes == 503  # 09:07 -> 17:30
        assert rec.approved_by == self.admin
        assert rec.manual_request_id == req.id

    def test_check_out_only_request_rejects_check_in_before_existing(self):
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()
        self._make_unclosed_day(day, hour=14)  # checked in 14:00

        too_early = timezone.make_aware(
            datetime.combine(day, datetime.strptime('09:00', '%H:%M').time()),
            timezone.get_current_timezone()
        )
        with pytest.raises(drf_serializers.ValidationError):
            ManualRequestService.create_request(
                employee=self.employee,
                attendance_date=day,
                request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT,
                requested_check_out=too_early,
                reason='x'
            )

    def test_missed_check_in_request_blocked_on_non_working_day(self):
        self._set_work_days('1,2,3,4,5')
        saturday = date(2026, 9, 26)
        assert saturday.isoweekday() == 6
        with pytest.raises(drf_serializers.ValidationError):
            ManualRequestService.create_request(
                employee=self.employee,
                attendance_date=saturday,
                request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_IN,
                requested_check_in=timezone.make_aware(
                    datetime.combine(saturday, datetime.strptime('09:00', '%H:%M').time()),
                    timezone.get_current_timezone()
                ),
                requested_check_out=timezone.make_aware(
                    datetime.combine(saturday, datetime.strptime('17:00', '%H:%M').time()),
                    timezone.get_current_timezone()
                ),
                reason='x'
            )

    def test_missed_check_in_request_blocked_when_record_exists(self):
        self._set_work_days('1,2,3,4,5')
        day = self._last_working_day(1)
        Attendance.objects.filter(employee=self.employee, attendance_date=day).delete()
        ManualAttendanceRequest.objects.filter(
            employee=self.employee, attendance_date=day
        ).delete()
        self._make_unclosed_day(day, hour=9)

        with pytest.raises(ConflictException):
            ManualRequestService.create_request(
                employee=self.employee,
                attendance_date=day,
                request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_IN,
                requested_check_in=timezone.make_aware(
                    datetime.combine(day, datetime.strptime('09:00', '%H:%M').time()),
                    timezone.get_current_timezone()
                ),
                requested_check_out=timezone.make_aware(
                    datetime.combine(day, datetime.strptime('17:00', '%H:%M').time()),
                    timezone.get_current_timezone()
                ),
                reason='x'
            )

    def test_missed_check_out_does_not_flag_non_working_days(self):
        """
        An unclosed record on a weekend must not raise a missed-checkout warning,
        because no check-out was ever required.
        """
        self._set_work_days('1,2,3,4,5')
        saturday = date(2026, 9, 26)
        self._make_unclosed_day(saturday, hour=10)
        assert AttendanceService.get_missed_checkout(self.employee) is None

    # ================= Daily attendance approval workflow =================

    def _approved_day(self, day, hour_in=9, hour_out=17, approve=True):
        """Creates a duty day directly, optionally already signed off."""
        from datetime import time as _time
        att = Attendance.objects.create(
            employee=self.employee,
            attendance_date=day,
            check_in_time=timezone.make_aware(
                datetime.combine(day, _time(hour_in, 0)), timezone.get_current_timezone()
            ),
            check_out_time=timezone.make_aware(
                datetime.combine(day, _time(hour_out, 0)), timezone.get_current_timezone()
            ),
            working_duration_minutes=(hour_out - hour_in) * 60,
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.PRESENT,
        )
        if approve:
            AttendanceApprovalService.approve(
                att.id, self.admin, remarks='Verified against field log.', request=None
            )
            att.refresh_from_db()
        return att

    def test_check_in_creates_pending_attendance(self):
        """A normal mobile punch must require admin sign-off before it counts."""
        self.client.force_authenticate(user=self.user_fa)
        duty_day = self._last_working_day(0)
        res = self.client.post(
            '/api/v1/attendance/check-in/',
            {'latitude': 23.81, 'longitude': 90.41}, format='json'
        )
        assert res.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), res.data

        att = Attendance.objects.get(employee=self.employee, attendance_date=get_dhaka_date())
        assert att.approval_status == Attendance.ApprovalStatus.PENDING
        assert att.approved_by is None
        assert att.approved_at is None
        assert duty_day is not None  # sanity: helper returned a working day

    def test_admin_can_approve_and_audit(self):
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)

        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/approve/',
                               {'admin_remarks': 'Confirmed with supervisor.'}, format='json')
        assert res.status_code == status.HTTP_200_OK, res.data
        assert res.data['approval_status'] == Attendance.ApprovalStatus.APPROVED

        att.refresh_from_db()
        assert att.approval_status == Attendance.ApprovalStatus.APPROVED
        assert att.approved_by == self.admin
        assert att.approved_at is not None
        assert att.admin_remarks == 'Confirmed with supervisor.'

        log = AuditLog.objects.filter(
            action='ATTENDANCE_APPROVED', object_type='Attendance', object_id=str(att.id)
        ).first()
        assert log is not None
        assert log.user == self.admin
        assert log.new_state['approval_status'] == Attendance.ApprovalStatus.APPROVED
        assert log.previous_state['approval_status'] == Attendance.ApprovalStatus.PENDING

    def test_double_approval_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        att = self._approved_day(self._last_working_day(1), approve=True)

        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/approve/',
                               {}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejection_requires_a_reason(self):
        self.client.force_authenticate(user=self.admin)
        att = self._approved_day(self._last_working_day(1), approve=False)

        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/reject/',
                               {}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        att.refresh_from_db()
        assert att.approval_status == Attendance.ApprovalStatus.PENDING

    def test_rejection_is_retained_and_audited(self):
        self.client.force_authenticate(user=self.admin)
        att = self._approved_day(self._last_working_day(1), approve=False)

        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/reject/',
                               {'admin_remarks': 'GPS far outside assignment.'}, format='json')
        assert res.status_code == status.HTTP_200_OK, res.data

        att.refresh_from_db()
        # Retained as evidence rather than deleted.
        assert att.approval_status == Attendance.ApprovalStatus.REJECTED
        assert att.admin_remarks == 'GPS far outside assignment.'
        assert Attendance.objects.filter(pk=att.pk).exists()

        log = AuditLog.objects.filter(
            action='ATTENDANCE_REJECTED', object_id=str(att.id)
        ).first()
        assert log is not None
        assert log.previous_state['approval_status'] == Attendance.ApprovalStatus.PENDING

    def test_void_requires_rejected_state_first(self):
        """Voiding is only legal after rejection, so the action stays auditable."""
        self.client.force_authenticate(user=self.admin)
        att = self._approved_day(self._last_working_day(1), approve=False)

        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/void/',
                               {}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert Attendance.objects.filter(pk=att.pk).exists()

    def test_void_frees_the_date_for_a_re_punch(self):
        """The unique constraint means void (delete) is the only escape hatch."""
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)

        self.client.post(f'/api/v1/attendance/admin/all/{att.id}/reject/',
                         {'admin_remarks': 'Wrong site logged.'}, format='json')
        res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/void/',
                               {'admin_remarks': 'Voided for correction.'}, format='json')
        assert res.status_code == status.HTTP_200_OK, res.data
        assert not Attendance.objects.filter(pk=att.pk).exists()

        # A fresh row for the same date is now possible.
        replacement = self._approved_day(day, hour_in=10, approve=False)
        assert replacement.approval_status == Attendance.ApprovalStatus.PENDING

        log = AuditLog.objects.filter(
            action='ATTENDANCE_VOIDED', object_id=str(att.id)
        ).first()
        assert log is not None
        # The punch data survives in the audit trail.
        assert log.previous_state['check_in_time'] is not None
        assert log.new_state is None

    def test_bulk_approve_covers_only_pending_rows(self):
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        pending = self._approved_day(day, approve=False)

        other = User.objects.create_user(
            username='testfa2', password='pw', email='fa2@test.com',
            role=User.Role.FIELD_ASSISTANT
        )
        other_emp = Employee.objects.create(
            user=other, employee_id='FA-TEST-2', full_name='Second Assistant',
            phone='+8801700000001', department=self.dept, is_active=True
        )
        from datetime import time as _time
        already = Attendance.objects.create(
            employee=other_emp,
            attendance_date=day,
            check_in_time=timezone.make_aware(
                datetime.combine(day, _time(9, 0)), timezone.get_current_timezone()
            ),
            working_duration_minutes=480,
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.PRESENT,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )

        res = self.client.post('/api/v1/attendance/admin/all/bulk-approve/',
                               {'date': str(day), 'admin_remarks': 'End of shift sweep.'},
                               format='json')
        assert res.status_code == status.HTTP_200_OK, res.data
        assert res.data['approved_count'] == 1

        pending.refresh_from_db()
        assert pending.approval_status == Attendance.ApprovalStatus.APPROVED
        already.refresh_from_db()
        assert already.approved_by is None  # untouched

        assert AuditLog.objects.filter(
            action='ATTENDANCE_BULK_APPROVED'
        ).exists()

    def test_bulk_approve_rejects_future_dates(self):
        self.client.force_authenticate(user=self.admin)
        tomorrow = get_dhaka_date() + timedelta(days=1)
        res = self.client.post('/api/v1/attendance/admin/all/bulk-approve/',
                               {'date': str(tomorrow)}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_field_assistant_cannot_approve(self):
        self.client.force_authenticate(user=self.user_fa)
        att = self._approved_day(self._last_working_day(1), approve=False)

        for verb in ('approve', 'reject', 'void'):
            res = self.client.post(f'/api/v1/attendance/admin/all/{att.id}/{verb}/',
                                   {'admin_remarks': 'x'}, format='json')
            assert res.status_code == status.HTTP_403_FORBIDDEN, verb

    def test_pending_day_is_excluded_from_reports(self):
        """Only approved attendance may inflate present counts or payroll minutes."""
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        pending = self._approved_day(day, approve=False)

        report = ReportService.get_daily_report(report_date=str(day))
        assert report['summary']['present'] == 0
        assert report['summary']['pending_approval'] == 1
        row = next(r for r in report['records'] if r['employee_id'] == self.employee.employee_id)
        # Still listed, so the admin can see the outstanding work.
        assert row['approval_status'] == Attendance.ApprovalStatus.PENDING

        AttendanceApprovalService.approve(pending.id, self.admin, request=None)
        report = ReportService.get_daily_report(report_date=str(day))
        assert report['summary']['present'] == 1
        assert report['summary']['pending_approval'] == 0

    def test_rejected_day_is_excluded_from_reports(self):
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)

        AttendanceApprovalService.reject(att.id, self.admin, remarks='Impossible timings.',
                                         request=None)
        report = ReportService.get_daily_report(report_date=str(day))
        assert report['summary']['present'] == 0
        assert report['summary']['rejected'] == 1
        # A rejected day must not be reported as a formal absence.
        assert report['summary']['absent'] == 0

    def _last_non_friday_working_day(self):
        """
        The monthly report hardcodes Friday as a weekend regardless of
        work_days, so absent/pending classification is only reachable on a
        working day that is not a Friday.
        """
        setting = AttendanceSetting.get_active()
        day = get_dhaka_date()
        for _ in range(400):
            if setting.is_working_day(day) and day.weekday() != 4:
                return day
            day -= timedelta(days=1)
        raise AssertionError('no non-Friday working day found')

    def test_pending_day_is_not_reported_as_absent_in_monthly(self):
        """Gating the aggregate must not silently turn unsigned days into absences."""
        self.client.force_authenticate(user=self.admin)
        day = self._last_non_friday_working_day()
        self._approved_day(day, approve=False)

        year, month = day.year, day.month
        report = ReportService.get_monthly_report(year, month)
        rec = next(r for r in report['records']
                   if r['employee_id'] == self.employee.employee_id)
        assert rec['pending_approval_days'] == 1
        day_entry = next(d for d in rec['days'] if d['day'] == day.day)
        # The unsigned day is classified as awaiting approval, NOT absent.
        assert day_entry['status'] == 'PENDING_APPROVAL'
        assert day_entry['label'] == 'Awaiting Approval'
        assert rec['absent_days'] == sum(
            1 for d in rec['days'] if d['status'] == 'ABSENT'
        )

    def test_rejected_day_is_not_reported_as_absent_in_monthly(self):
        self.client.force_authenticate(user=self.admin)
        day = self._last_non_friday_working_day()
        att = self._approved_day(day, approve=False)
        AttendanceApprovalService.reject(att.id, self.admin, remarks='Rejected.',
                                         request=None)

        report = ReportService.get_monthly_report(day.year, day.month)
        rec = next(r for r in report['records']
                   if r['employee_id'] == self.employee.employee_id)
        assert rec['rejected_days'] == 1
        day_entry = next(d for d in rec['days'] if d['day'] == day.day)
        # The rejected day is classified as rejected, NOT absent.
        assert day_entry['status'] == 'REJECTED'
        assert day_entry['label'] == 'Rejected'
        assert rec['absent_days'] == sum(
            1 for d in rec['days'] if d['status'] == 'ABSENT'
        )

    def test_employee_report_counts_only_approved_minutes(self):
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        self._approved_day(day, hour_in=9, hour_out=17, approve=False)

        report = ReportService.get_employee_report(
            self.employee.employee_id,
            start_date=str(day), end_date=str(day)
        )
        assert report['summary']['pending_approval_days'] == 1
        assert report['summary']['total_working_minutes'] == 0

    def test_manual_request_produces_approved_attendance_without_second_click(self):
        """An approved correction IS the day's sign-off, so no re-approval is needed."""
        duty_day = self._last_working_day(1)
        check_in = self._at(duty_day, '09:00')
        check_out = self._at(duty_day, '17:00')

        req = ManualAttendanceRequest.objects.create(
            employee=self.employee,
            attendance_date=duty_day,
            requested_check_in=check_in,
            requested_check_out=check_out,
            reason='Remote area without connectivity.',
        )
        ManualRequestService.approve_request(req.id, self.admin,
                                             admin_remarks='Verified.', request=None)

        att = Attendance.objects.get(employee=self.employee, attendance_date=duty_day)
        assert att.approval_status == Attendance.ApprovalStatus.APPROVED
        assert att.attendance_type == Attendance.Type.MANUAL
        assert att.approved_by == self.admin

    def test_rejected_day_stops_the_missed_checkout_nag(self):
        """
        A rejected day is an admin dispute, not an open shift, so the assistant
        must no longer be prompted to file a correction for it.
        """
        day = self._last_working_day(1)
        att = self._make_unclosed_day(day, hour=10)
        assert AttendanceService.get_missed_checkout(self.employee) is not None

        AttendanceApprovalService.reject(att.id, self.admin, remarks='Under review.',
                                         request=None)
        assert AttendanceService.get_missed_checkout(self.employee) is None

    def test_pending_day_still_nags_for_checkout(self):
        day = self._last_working_day(1)
        self._make_unclosed_day(day, hour=10)
        assert AttendanceService.get_missed_checkout(self.employee) is not None

    def test_today_summary_still_shows_a_punched_pending_day(self):
        """
        Gating the punch screen would invite a second check-in and a 409, so a
        pending row must remain visible to the assistant.
        """
        today = get_dhaka_date()
        Attendance.objects.create(
            employee=self.employee,
            attendance_date=today,
            check_in_time=self._at(today, '09:00'),
            attendance_type=Attendance.Type.AUTOMATIC,
            status=Attendance.Status.PRESENT,
        )
        summary = AttendanceService.get_today_summary(self.employee)
        assert summary['is_checked_in'] is True

    def test_calendar_exposes_approval_state_to_the_assistant(self):
        self.client.force_authenticate(user=self.user_fa)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)

        res = self.client.get(
            '/api/v1/attendance/my-calendar/',
            {'month': day.month, 'year': day.year}
        )
        assert res.status_code == status.HTTP_200_OK, res.data
        entry = next(d for d in res.data['days'] if d['date'] == str(day))
        assert entry['attendance']['approval_status'] == Attendance.ApprovalStatus.PENDING
        assert entry['remarks'] == 'Awaiting admin approval'
        assert res.data['summary']['pending_approval'] == 1

    def test_calendar_reports_rejection_to_the_assistant(self):
        self.client.force_authenticate(user=self.user_fa)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)
        AttendanceApprovalService.reject(att.id, self.admin, remarks='Bad GPS.',
                                         request=None)

        res = self.client.get(
            '/api/v1/attendance/my-calendar/',
            {'month': day.month, 'year': day.year}
        )
        entry = next(d for d in res.data['days'] if d['date'] == str(day))
        assert 'Rejected' in entry['remarks']

    def test_reset_duty_is_audited_as_a_void(self):
        """
        Reset Duty hard-deletes, so it must leave a full audit snapshot behind
        rather than claiming a state change it did not make.
        """
        self.client.force_authenticate(user=self.admin)
        day = self._last_working_day(1)
        att = self._approved_day(day, approve=False)

        count = AttendanceService.reset_today_attendance(
            admin_user=self.admin, target_date=day
        )
        assert count == 1
        assert not Attendance.objects.filter(pk=att.pk).exists()

        log = AuditLog.objects.filter(
            action='ATTENDANCE_VOIDED', object_id=str(att.id)
        ).first()
        assert log is not None
        assert log.previous_state['check_in_time'] is not None
        assert log.previous_state['attendance_id'] == att.id

    def test_admin_queue_can_filter_by_approval_status(self):
        self.client.force_authenticate(user=self.admin)
        pending = self._approved_day(self._last_working_day(1), approve=False)
        self._approved_day(self._last_working_day(3), approve=True)

        res = self.client.get(
            '/api/v1/attendance/admin/all/',
            {'approval_status': Attendance.ApprovalStatus.PENDING}
        )
        assert res.status_code == status.HTTP_200_OK
        ids = [r['id'] for r in res.data['results']]
        assert pending.id in ids

        res = self.client.get(
            '/api/v1/attendance/admin/all/',
            {'approval_status': Attendance.ApprovalStatus.APPROVED}
        )
        ids = [r['id'] for r in res.data['results']]
        assert pending.id not in ids

    def test_report_employee_type_filter_scopes_daily_and_monthly(self):
        """An employee_type filter must return only employees of that type."""
        beta_user = User.objects.create_user(
            username="testfa_beta",
            password="fapassword",
            email="beta@test.com",
            role=User.Role.FIELD_ASSISTANT
        )
        beta_emp = Employee.objects.create(
            user=beta_user,
            employee_id="FA-BETA",
            full_name="Beta Intern",
            phone="+8801711111111",
            department=self.dept,
            employee_type='INTERN',
            is_active=True
        )

        target = get_dhaka_date()
        alpha_att = Attendance.objects.create(
            employee=self.employee,
            attendance_date=target,
            attendance_type=Attendance.Type.AUTOMATIC,
            check_in_time=get_dhaka_datetime() - timedelta(hours=2),
            check_out_time=get_dhaka_datetime() - timedelta(hours=1),
            working_duration_minutes=60,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )
        beta_att = Attendance.objects.create(
            employee=beta_emp,
            attendance_date=target,
            attendance_type=Attendance.Type.AUTOMATIC,
            check_in_time=get_dhaka_datetime() - timedelta(hours=3),
            check_out_time=get_dhaka_datetime() - timedelta(minutes=30),
            working_duration_minutes=150,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )

        self.client.force_authenticate(user=self.admin)

        # Unfiltered: both assistants present.
        res_all = self.client.get('/api/v1/admin/reports/daily/', {'date': str(target)})
        assert res_all.status_code == status.HTTP_200_OK
        assert res_all.data['summary']['total_assistants'] == 2
        assert res_all.data['summary']['present'] == 2

        # Field Staff only.
        res_staff = self.client.get(
            '/api/v1/admin/reports/daily/',
            {'date': str(target), 'employee_type': 'FIELD_STAFF'}
        )
        assert res_staff.status_code == status.HTTP_200_OK
        assert res_staff.data['summary']['total_assistants'] == 1
        assert res_staff.data['summary']['present'] == 1
        assert [r['employee_id'] for r in res_staff.data['records']] == ['FA-TEST']
        assert res_staff.data['records'][0]['employee_type_display'] == 'Field Staff'

        # Interns only.
        res_intern = self.client.get(
            '/api/v1/admin/reports/daily/',
            {'date': str(target), 'employee_type': 'INTERN'}
        )
        assert res_intern.data['summary']['total_assistants'] == 1
        assert [r['employee_id'] for r in res_intern.data['records']] == ['FA-BETA']

        # Unknown type yields an empty, well-formed report rather than an error.
        res_none = self.client.get(
            '/api/v1/admin/reports/daily/',
            {'date': str(target), 'employee_type': 'BOGUS'}
        )
        assert res_none.status_code == status.HTTP_200_OK
        assert res_none.data['summary']['total_assistants'] == 0
        assert res_none.data['records'] == []

        # Dashboard summary honours the same scope.
        res_dash = self.client.get(
            '/api/v1/admin/reports/dashboard-summary/',
            {'date': str(target), 'employee_type': 'FIELD_STAFF'}
        )
        assert res_dash.data['total_assistants'] == 1
        assert res_dash.data['present'] == 1

        # Monthly muster roll is scoped too.
        res_month = self.client.get(
            '/api/v1/admin/reports/monthly/',
            {'year': target.year, 'month': target.month, 'employee_type': 'INTERN'}
        )
        assert res_month.status_code == status.HTTP_200_OK
        assert [r['employee_id'] for r in res_month.data['records']] == ['FA-BETA']

        # Each punch is reachable through its own employee type only.
        assert Employee.objects.filter(
            id=self.employee.id, employee_type='FIELD_STAFF'
        ).exists()
        assert Employee.objects.filter(
            id=beta_emp.id, employee_type='INTERN'
        ).exists()
        assert Attendance.objects.get(id=alpha_att.id).employee.employee_type == 'FIELD_STAFF'
        assert Attendance.objects.get(id=beta_att.id).employee.employee_type == 'INTERN'

    def test_report_employee_type_filter_combines_with_department(self):
        """Employee-type and department filters must intersect, not override."""
        other_dept = Department.objects.create(name="Survey", code="SUR")

        other_user = User.objects.create_user(
            username="testfa_other",
            password="fapassword",
            email="other@test.com",
            role=User.Role.FIELD_ASSISTANT
        )
        Employee.objects.create(
            user=other_user,
            employee_id="FA-OTHER",
            full_name="Other Intern",
            phone="+8801722222222",
            department=other_dept,
            employee_type='INTERN',
            is_active=True
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/admin/reports/daily/', {
            'date': str(get_dhaka_date()),
            'employee_type': 'INTERN',
            'department': other_dept.id,
        })
        assert res.status_code == status.HTTP_200_OK
        assert [r['employee_id'] for r in res.data['records']] == ['FA-OTHER']

    def test_employee_report_respects_employee_type_scope(self):
        """An employee dossier must not leak across an employee-type boundary."""
        self.client.force_authenticate(user=self.admin)
        start = str(get_dhaka_date() - timedelta(days=30))
        end = str(get_dhaka_date())

        res_ok = self.client.get(
            f'/api/v1/admin/reports/employee/{self.employee.employee_id}/',
            {'start_date': start, 'end_date': end, 'employee_type': 'FIELD_STAFF'}
        )
        assert res_ok.status_code == status.HTTP_200_OK
        assert res_ok.data['employee']['employee_id'] == 'FA-TEST'
        assert res_ok.data['employee']['employee_type_display'] == 'Field Staff'

        res_cross = self.client.get(
            f'/api/v1/admin/reports/employee/{self.employee.employee_id}/',
            {'start_date': start, 'end_date': end, 'employee_type': 'INTERN'}
        )
        assert res_cross.status_code == status.HTTP_404_NOT_FOUND

    def test_approval_queue_filters_by_employee_type(self):
        mine = Attendance.objects.create(
            employee=self.employee,
            attendance_date=get_dhaka_date() - timedelta(days=1),
            attendance_type=Attendance.Type.AUTOMATIC,
            check_in_time=get_dhaka_datetime() - timedelta(days=1),
            check_out_time=get_dhaka_datetime() - timedelta(hours=2),
            working_duration_minutes=60,
            approval_status=Attendance.ApprovalStatus.PENDING,
        )

        self.client.force_authenticate(user=self.admin)
        res_other = self.client.get(
            '/api/v1/attendance/admin/all/',
            {'approval_status': 'PENDING', 'employee_type': 'INTERN'}
        )
        assert res_other.status_code == status.HTTP_200_OK
        ids = [r['id'] for r in res_other.data['results']]
        assert mine.id not in ids

        res_mine = self.client.get(
            '/api/v1/attendance/admin/all/',
            {'approval_status': 'PENDING', 'employee_type': 'FIELD_STAFF'}
        )
        assert mine.id in [r['id'] for r in res_mine.data['results']]

    def test_employee_type_filtered_export_carries_scope_metadata(self):
        intern_user = User.objects.create_user(
            username="testfa_intern",
            password="fapassword",
            email="intern@test.com",
            role=User.Role.FIELD_ASSISTANT
        )
        intern_emp = Employee.objects.create(
            user=intern_user,
            employee_id="FA-INTERN",
            full_name="Intern Export",
            phone="+8801733333333",
            department=self.dept,
            employee_type='INTERN',
            is_active=True,
        )
        Attendance.objects.create(
            employee=intern_emp,
            attendance_date=get_dhaka_date(),
            attendance_type=Attendance.Type.AUTOMATIC,
            check_in_time=get_dhaka_datetime() - timedelta(hours=2),
            check_out_time=get_dhaka_datetime() - timedelta(hours=1),
            working_duration_minutes=60,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/v1/admin/reports/daily/export/',
            {'date': str(get_dhaka_date()), 'employee_type': 'INTERN', 'format': 'csv'}
        )
        assert res.status_code == status.HTTP_200_OK
        assert b'Employee Type' in res.content
        assert b'Intern' in res.content

        # XLSX metadata must also record the scope; unzip and inspect the sheet.
        res_x = self.client.get(
            '/api/v1/admin/reports/daily/export/',
            {'date': str(get_dhaka_date()), 'employee_type': 'INTERN', 'format': 'xlsx'}
        )
        assert res_x.status_code == status.HTTP_200_OK
        import io
        import zipfile
        with zipfile.ZipFile(io.BytesIO(res_x.content)) as zf:
            blob = b''.join(zf.read(n) for n in zf.namelist() if n.endswith('.xml'))
        assert b'Intern' in blob
