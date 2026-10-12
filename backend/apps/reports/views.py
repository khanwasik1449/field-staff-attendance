from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .services import ReportService
from apps.accounts.permissions import IsAdmin
from apps.attendance.services import get_dhaka_date


def _employee_type_label(request):
    """Resolve the human-readable employee-type name for export metadata."""
    employee_type = request.query_params.get('employee_type')
    if not employee_type:
        return 'All Employee Types'
    from apps.accounts.models import EmployeeType
    type_obj = EmployeeType.objects.filter(code=employee_type).only('name').first()
    return type_obj.name if type_obj else f'Employee Type {employee_type}'


def _filter_metadata(request):
    """Employee-type/department scope lines appended to official export metadata."""
    dept_id = request.query_params.get('department')
    scope = [('Employee Type Scope', _employee_type_label(request))]
    if dept_id:
        from apps.accounts.models import Department
        dept = Department.objects.filter(pk=dept_id).first()
        scope.append(('Department Scope', dept.name if dept else f'Department #{dept_id}'))
    return scope

class BaseExportView(APIView):
    permission_classes = [IsAdmin]

    def perform_content_negotiation(self, request, force=False):
        """
        Bypass DRF's default format suffix negotiation so that raw CSV/XLSX
        file streams with ?format=csv or ?format=xlsx don't trigger 404 Not Found.
        """
        return (JSONRenderer(), 'application/json')


class DashboardSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        date_str = request.query_params.get('date')
        report_data = ReportService.get_daily_report(
            report_date=date_str,
            employee_type=request.query_params.get('employee_type'),
        )
        return Response(report_data['summary'], status=status.HTTP_200_OK)


class DailyReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        date_str = request.query_params.get('date')
        dept_id = request.query_params.get('department')
        status_filter = request.query_params.get('status')
        type_filter = request.query_params.get('attendance_type')

        data = ReportService.get_daily_report(
            report_date=date_str,
            department_id=dept_id,
            employee_type=request.query_params.get('employee_type'),
            status_filter=status_filter,
            type_filter=type_filter
        )
        return Response(data, status=status.HTTP_200_OK)


class DailyReportExportView(BaseExportView):
    def get(self, request):
        date_str = request.query_params.get('date') or str(get_dhaka_date())
        export_format = (request.query_params.get('format') or 'csv').lower()
        dept_id = request.query_params.get('department')
        status_filter = request.query_params.get('status')
        type_filter = request.query_params.get('attendance_type')

        data = ReportService.get_daily_report(
            report_date=date_str,
            department_id=dept_id,
            employee_type=request.query_params.get('employee_type'),
            status_filter=status_filter,
            type_filter=type_filter
        )
        records = data['records']
        summary = data['summary']

        headers = [
            'Sl No.',
            'Employee ID',
            'Full Name',
            'Designation',
            'Department',
            'Employee Type',
            'Check In (Dhaka Time)',
            'Check In Location & GPS',
            'Check Out (Dhaka Time)',
            'Check Out Location & GPS',
            'Working Hours',
            'Type',
            'Status',
            'Approved By',
            'HR Remarks'
        ]
        rows = []
        for idx, r in enumerate(records, 1):
            # Check-in location string
            in_loc = r.get('check_in_address') or ""
            if r.get('check_in_latitude') and r.get('check_in_longitude'):
                coord_str = f"({r['check_in_latitude']:.4f}, {r['check_in_longitude']:.4f})"
                in_loc = f"{in_loc} {coord_str}".strip() if in_loc else coord_str
            if not in_loc:
                in_loc = "--"

            # Check-out location string
            out_loc = r.get('check_out_address') or ""
            if r.get('check_out_latitude') and r.get('check_out_longitude'):
                coord_str = f"({r['check_out_latitude']:.4f}, {r['check_out_longitude']:.4f})"
                out_loc = f"{out_loc} {coord_str}".strip() if out_loc else coord_str
            if not out_loc:
                out_loc = "--"

            rows.append([
                idx,
                r['employee_id'],
                r['employee_name'],
                r.get('designation') or "Field Assistant",
                r['department'],
                r.get('employee_type_display') or r.get('employee_type') or "--",
                r['check_in'],
                in_loc,
                r['check_out'],
                out_loc,
                r['duration'],
                r['type'],
                r['status'],
                r['approved_by'],
                r['remarks']
            ])

        filename = f"fams_daily_attendance_register_{date_str}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Daily Attendance & Duty Register - {date_str}",
                headers,
                rows,
                metadata=[
                    ("Report Date", date_str),
                    *_filter_metadata(request),
                    ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                    ("Document Classification", "Official HR Attendance Record & Payroll Register"),
                ],
                summary_stats=[
                    ("Total Staff", summary['total_assistants']),
                    ("Present", summary['present']),
                    ("Late Arrivals", summary['late']),
                    ("On Leave", summary.get('on_leave', 0)),
                    ("Holiday", summary.get('holiday', 0)),
                    ("Absent", summary['absent']),
                    ("Incomplete", summary['incomplete']),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)


class MonthlyReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        today = get_dhaka_date()
        year = int(request.query_params.get('year', today.year))
        month = int(request.query_params.get('month', today.month))
        dept_id = request.query_params.get('department')

        data = ReportService.get_monthly_report(
            year=year, month=month, department_id=dept_id,
            employee_type=request.query_params.get('employee_type'),
        )
        return Response(data, status=status.HTTP_200_OK)


class MonthlyReportExportView(BaseExportView):
    def get(self, request):
        today = get_dhaka_date()
        year = int(request.query_params.get('year', today.year))
        month = int(request.query_params.get('month', today.month))
        dept_id = request.query_params.get('department')
        export_format = (request.query_params.get('format') or 'csv').lower()
        view_type = (request.query_params.get('view_type') or request.query_params.get('mode') or 'summary').lower()

        data = ReportService.get_monthly_report(
            year=year, month=month, department_id=dept_id,
            employee_type=request.query_params.get('employee_type'),
        )
        records = data['records']
        days_meta = data.get('days_metadata', [])

        if view_type == 'daywise':
            headers = [
                'Sl No.',
                'Employee ID',
                'Full Name',
                'Designation',
                'Department',
                'Employee Type'
            ]
            for dm in days_meta:
                headers.append(f"{dm['day']:02d} ({dm['weekday']})")

            headers.extend([
                'Present Days',
                'Late Days',
                'Leave Days',
                'Holidays',
                'Weekend Days',
                'Absent Days',
                'Manual Days',
                'Total Hours'
            ])

            rows = []
            for idx, r in enumerate(records, 1):
                row = [
                    idx,
                    r['employee_id'],
                    r['employee_name'],
                    r.get('designation') or "Field Assistant",
                    r['department'],
                    r.get('employee_type_display') or r.get('employee_type') or "--"
                ]
                day_codes = {d['day']: d['code'] for d in r.get('days', [])}
                for dm in days_meta:
                    row.append(day_codes.get(dm['day'], '-'))

                row.extend([
                    r['present_days'],
                    r['late_days'],
                    r['leave_days'],
                    r['holiday_days'],
                    r.get('weekend_days', 0),
                    r['absent_days'],
                    r['manual_days'],
                    r['total_working_hours']
                ])
                rows.append(row)

            filename = f"fams_monthly_attendance_muster_roll_{year}_{month:02d}"

            if export_format == 'xlsx':
                return ReportService.export_xlsx_response(
                    f"{filename}.xlsx",
                    f"Official Day-wise Attendance Muster Roll - {year}/{month:02d}",
                    headers,
                    rows,
                    metadata=[
                        ("Period (Year-Month)", f"{year}-{month:02d}"),
                        *_filter_metadata(request),
                        ("Calendar Days", str(data.get('total_days', len(days_meta)))),
                        ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                        ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                        ("Document Classification", "Official HR Attendance Muster Roll & Compliance Register"),
                        ("Legend", "P: Present | L: Late | M: Manual | LV: Leave | H: Holiday | W: Weekend | A: Absent")
                    ]
                )
            return ReportService.export_csv_response(f"{filename}.csv", headers, rows)

        headers = [
            'Sl No.',
            'Employee ID',
            'Full Name',
            'Designation',
            'Department',
            'Employee Type',
            'Present Days',
            'Late Days',
            'Leave Days',
            'Holidays',
            'Weekend Days',
            'Absent Days',
            'Manual Days',
            'Total Working Hours'
        ]
        rows = [
            [
                idx,
                r['employee_id'],
                r['employee_name'],
                r.get('designation') or "Field Assistant",
                r['department'],
                r.get('employee_type_display') or r.get('employee_type') or "--",
                r['present_days'],
                r['late_days'],
                r['leave_days'],
                r['holiday_days'],
                r.get('weekend_days', 0),
                r['absent_days'],
                r['manual_days'],
                r['total_working_hours']
            ]
            for idx, r in enumerate(records, 1)
        ]

        filename = f"fams_monthly_attendance_summary_{year}_{month:02d}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Monthly Attendance & Working Hours Summary - {year}/{month:02d}",
                headers,
                rows,
                metadata=[
                    ("Period (Year-Month)", f"{year}-{month:02d}"),
                    *_filter_metadata(request),
                    ("Working Days in Month", str(data.get('total_days', '--'))),
                    ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                    ("Document Classification", "Official Monthly HR Compliance & Payroll Audit"),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)


class EmployeeReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, employee_id):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        data = ReportService.get_employee_report(
            employee_id, start_date=start_date, end_date=end_date,
            employee_type=request.query_params.get('employee_type'),
        )
        if not data:
            return Response({'detail': f'Employee with identifier {employee_id} not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(data, status=status.HTTP_200_OK)


class EmployeeReportExportView(BaseExportView):
    def get(self, request, employee_id):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        export_format = (request.query_params.get('format') or 'csv').lower()

        data = ReportService.get_employee_report(
            employee_id, start_date=start_date, end_date=end_date,
            employee_type=request.query_params.get('employee_type'),
        )
        if not data:
            return Response({'detail': f'Employee with identifier {employee_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

        records = data['daily_records']
        headers = [
            'Sl No.',
            'Date',
            'Check In (Time)',
            'Check In Location & GPS',
            'Check Out (Time)',
            'Check Out Location & GPS',
            'Working Hours',
            'Attendance Type',
            'Status',
            'Approved By',
            'Remarks'
        ]
        rows = []
        for idx, r in enumerate(records, 1):
            in_loc = r.get('check_in_address') or ""
            if r.get('check_in_latitude') and r.get('check_in_longitude'):
                coord_str = f"({r['check_in_latitude']:.4f}, {r['check_in_longitude']:.4f})"
                in_loc = f"{in_loc} {coord_str}".strip() if in_loc else coord_str
            if not in_loc:
                in_loc = "--"

            out_loc = r.get('check_out_address') or ""
            if r.get('check_out_latitude') and r.get('check_out_longitude'):
                coord_str = f"({r['check_out_latitude']:.4f}, {r['check_out_longitude']:.4f})"
                out_loc = f"{out_loc} {coord_str}".strip() if out_loc else coord_str
            if not out_loc:
                out_loc = "--"

            rows.append([
                idx,
                r['date'],
                r['check_in'],
                in_loc,
                r['check_out'],
                out_loc,
                r['duration'],
                r['type'],
                r['status'],
                r['approved_by'],
                r['remarks']
            ])

        emp = data['employee']
        emp_code = emp['employee_id']
        filename = f"fams_employee_attendance_dossier_{emp_code}_{start_date}_to_{end_date}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Employee Attendance Dossier - {emp['full_name']} ({emp_code})",
                headers,
                rows,
                metadata=[
                    ("Employee ID", emp['employee_id']),
                    ("Full Name", emp['full_name']),
                    ("Designation", emp.get('designation') or "Field Assistant"),
                    ("Department", emp.get('department') or "--"),
                    ("Employee Type", emp.get('employee_type_display') or emp.get('employee_type') or "--"),
                    ("Report Scope", _employee_type_label(request)),
                    ("Reporting Period", f"{start_date} to {end_date}"),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                ],
                summary_stats=[
                    ("Days in Range", data['summary']['total_days_range']),
                    ("Present Days", data['summary']['present_days']),
                    ("Late Days", data['summary']['late_days']),
                    ("Absent Days", data['summary']['absent_days']),
                    ("Manual Punches", data['summary']['manual_days']),
                    ("Working Hours", data['summary']['total_working_hours']),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)
