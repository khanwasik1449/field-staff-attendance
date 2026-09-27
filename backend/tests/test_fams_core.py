import pytest
from datetime import datetime, date, timedelta, time
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import serializers as drf_serializers
from rest_framework import status

from apps.accounts.models import User, Department, Project, Employee
from apps.attendance.models import Attendance, AttendanceSetting
from apps.requests.models import ManualAttendanceRequest
from apps.requests.services import ManualRequestService
from apps.audit.models import AuditLog
from apps.attendance.services import (
    get_dhaka_datetime, get_dhaka_date, AttendanceService, ConflictException
)

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

    def test_login_and_jwt(self):
        res = self.client.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'fapassword'
        })
        assert res.status_code == status.HTTP_200_OK
        assert 'access' in res.data
        assert 'refresh' in res.data
        assert res.data['employee']['employee_id'] == "FA-TEST"

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
        """Most recent configured working day, skipping back over non-working days."""
        setting = AttendanceSetting.get_active()
        day = get_dhaka_date() - timedelta(days=offset_days_back)
        for _ in range(14):
            if setting.is_working_day(day):
                return day
            day -= timedelta(days=1)
        raise AssertionError("no working day found in 14 days")

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

    def test_gps_checkin_and_geofencing(self):
        # Create project with coordinates
        project = Project.objects.create(
            name="Test Project",
            code="PRJ-GPS",
            latitude=23.8103,
            longitude=90.4125,
            radius_meters=500
        )
        self.employee.project = project
        self.employee.save()

        self.client.force_authenticate(user=self.user_fa)

        # Check in within boundary (approx 50m away)
        res = self.client.post('/api/v1/attendance/check-in/', {
            'latitude': 23.8105,
            'longitude': 90.4127,
            'accuracy': 10.5
        })
        assert res.status_code == status.HTTP_201_CREATED
        att = Attendance.objects.get(id=res.data['attendance']['id'])
        assert att.check_in_latitude is not None
        assert att.check_in_is_geofence_violation is False
        assert att.check_in_distance_meters is not None
        assert att.check_in_distance_meters < 500

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

    def test_bangladesh_district_assignment_and_auto_coordinates(self):
        """
        Verify that admin can add locations and assign FAs using Bangladesh District/Zilla
        without entering GPS coordinates, and coordinates are automatically mapped.
        """
        # 1. Geo endpoint
        res_geo = self.client.get('/api/v1/auth/geo/')
        assert res_geo.status_code == status.HTTP_200_OK
        assert len(res_geo.data['divisions']) == 8
        assert 'Dhaka' in res_geo.data['geo']
        assert 'Gazipur' in res_geo.data['geo']['Dhaka']

        # 2. Admin creates project with district only (no manual coordinates)
        self.client.force_authenticate(user=self.admin)
        res_proj = self.client.post('/api/v1/auth/projects/', {
            'name': 'Gazipur Field Office',
            'code': 'GZP-SITE-1',
            'division': 'Dhaka',
            'district': 'Gazipur',
            'upazila': 'Tongi',
            'radius_meters': 1000
        })
        assert res_proj.status_code == status.HTTP_201_CREATED
        assert float(res_proj.data['latitude']) == 24.0023
        assert float(res_proj.data['longitude']) == 90.4264
        assert res_proj.data['district'] == 'Gazipur'
        project_id = res_proj.data['id']

        # 3. Admin creates Field Assistant with district & upazila
        res_emp = self.client.post('/api/v1/auth/employees/', {
            'employee_id': 'FA-GZP-01',
            'full_name': 'Hasan Mahmud',
            'username': 'hasan_gzp',
            'password': 'password123',
            'division': 'Dhaka',
            'district': 'Gazipur',
            'upazila': 'Tongi',
            'project': project_id,
            'role': 'FIELD_ASSISTANT'
        })
        assert res_emp.status_code == status.HTTP_201_CREATED
        assert res_emp.data['district'] == 'Gazipur'
        assert res_emp.data['upazila'] == 'Tongi'

        # 4. Check employee list returns district and upazila
        res_list = self.client.get('/api/v1/auth/employees/?search=FA-GZP-01')
        assert res_list.status_code == status.HTTP_200_OK
        emp_record = res_list.data['results'][0]
        assert emp_record['district'] == 'Gazipur'
        assert emp_record['upazila'] == 'Tongi'

    def test_district_wise_summary_report(self):
        """
        Verify that admin can fetch district-wise total FA summary report,
        which aggregates field assistants by Bangladesh district coordinates.
        """
        # 1. Non-admin forbidden
        self.client.force_authenticate(user=self.user_fa)
        res_forbidden = self.client.get('/api/v1/admin/reports/district-summary/')
        assert res_forbidden.status_code == status.HTTP_403_FORBIDDEN

        # 2. Admin retrieves district summary
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/admin/reports/district-summary/')
        assert res.status_code == status.HTTP_200_OK
        assert 'total_districts' in res.data
        assert 'total_active_fas' in res.data
        assert 'districts' in res.data
        assert isinstance(res.data['districts'], list)

    def test_admin_reset_employee_password(self):
        """
        Verify that admin can reset an employee's password via detail and quick-reset endpoints,
        and the employee can log in with the new password.
        """
        # 1. Detail reset endpoint
        self.client.force_authenticate(user=self.admin)
        res_reset = self.client.post(f'/api/v1/auth/employees/{self.employee.id}/reset-password/', {
            'new_password': 'newpassword123'
        })
        assert res_reset.status_code == status.HTTP_200_OK
        assert 'successfully updated' in res_reset.data['detail']

        # Verify login works with new password
        client2 = APIClient()
        res_login = client2.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'newpassword123'
        })
        assert res_login.status_code == status.HTTP_200_OK

        # 2. Quick reset endpoint using employee_id
        res_quick = self.client.post('/api/v1/auth/employees/quick-reset-password/', {
            'employee_id': self.employee.employee_id,
            'new_password': 'anotherpassword456'
        })
        assert res_quick.status_code == status.HTTP_200_OK

        # Verify login with the quick-reset password
        res_login2 = client2.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'anotherpassword456'
        })
        assert res_login2.status_code == status.HTTP_200_OK

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

    def test_project_based_fa_bulk_upload_and_template(self):
        """
        Verify that admin can download bulk upload templates and upload project-based
        Field Assistants via CSV and Excel with project site matching and user creation.
        """
        import io
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.accounts.services import EmployeeBulkUploadService

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

        # 3. Admin bulk uploads FAs via CSV with project assignment
        from apps.accounts.models import Project, Employee
        test_project = Project.objects.create(
            name="Dhaka North Infrastructure",
            code="PRJ-DHK-NORTH",
            district="Dhaka",
            division="Dhaka",
            upazila="Uttara"
        )

        csv_content = (
            "Employee ID,Full Name,Username,Project Code,Phone Number,District,Designation,Password\n"
            f"FA-BULK-1,Bulk Assistant One,bulkasst1,{test_project.code},01799887766,Dhaka,Field Assistant,secretpass123\n"
            f"FA-BULK-2,Bulk Assistant Two,bulkasst2,{test_project.code},01899887766,Dhaka,Senior Field Assistant,secretpass123\n"
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
        assert e1.project == test_project
        assert e1.user.username == 'bulkasst1'

        # Verify login works for bulk created employee
        client2 = APIClient()
        res_login = client2.post('/api/v1/auth/login/', {
            'username': 'bulkasst1',
            'password': 'secretpass123'
        })
        assert res_login.status_code == status.HTTP_200_OK







    def test_refresh_token_rotation_contract(self):
        """
        SIMPLE_JWT runs with ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION.
        The client must persist the rotated refresh token it receives, otherwise the
        next refresh replays a blacklisted token and logs the user out for good.
        Locks that contract so the SPA fix cannot silently regress.
        """
        login = self.client.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'fapassword'
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
        assert 'enforce_geofence' in res.data['settings']
        assert res.data['settings']['require_gps'] is False

    def test_admin_can_toggle_enforce_geofence(self):
        """
        enforce_geofence is persisted and audited but stays unenforced server-side:
        out-of-site punches are recorded and flagged, never rejected.
        """
        res = self.client.patch(
            '/api/v1/attendance/settings/',
            {'enforce_geofence': True},
            format='json',
            HTTP_AUTHORIZATION='Bearer ' + self._admin_access()
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data['enforce_geofence'] is True
        self.setting.refresh_from_db()
        assert self.setting.enforce_geofence is True
        assert AuditLog.objects.filter(action='SETTING_UPDATED').exists()

        # Field assistants cannot reach settings.
        forbidden = self.client.patch(
            '/api/v1/attendance/settings/',
            {'enforce_geofence': False},
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
        res = self.client.post('/api/v1/auth/login/', {
            'username': 'testfa',
            'password': 'fapassword'
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

    def test_missed_checkout_counts_all_outstanding_days(self):
        """Multiple unclosed duty days are reported with an accurate count."""
        # Two distinct working days, so the count is genuinely 2.
        days = [self._last_working_day(1), self._last_working_day(3)]
        for day in days:
            Attendance.objects.create(
                employee=self.employee,
                attendance_date=day,
                check_in_time=self._at(day, '09:00'),
                attendance_type=Attendance.Type.AUTOMATIC,
                status=Attendance.Status.INCOMPLETE
            )

        missed = AttendanceService.get_today_summary(self.employee)['missed_checkout']
        assert missed is not None
        assert missed['count'] == 2
        # The most recent outstanding day is reported first.
        assert missed['attendance_date'] == str(days[0])

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

    def test_calendar_excludes_non_working_days_and_future_days(self):
        self._set_work_days('1,2,3,4,5')
        today = get_dhaka_date()
        cal = AttendanceService.get_monthly_calendar(self.employee, today.year, today.month)

        for entry in cal['days']:
            parsed = datetime.strptime(entry['date'], '%Y-%m-%d').date()
            assert AttendanceSetting.get_active().is_working_day(parsed), (
                f"{parsed} should not be listed as a working day"
            )
            if parsed > today:
                assert entry['is_future'] is True
                assert entry['issue'] is None

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
