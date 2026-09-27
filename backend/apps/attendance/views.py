from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.db.models import Q
from .models import Attendance, AttendanceSetting
from .schedule_services import ScheduleService
from .serializers import (
    EmployeeScheduleBulkSerializer,
    AttendanceSerializer,
    AttendanceSettingSerializer,
    CheckInRequestSerializer,
    CheckOutRequestSerializer
)
from .services import (
    AttendanceService,
    get_dhaka_datetime,
    get_dhaka_date,
    format_time_display
)
from apps.accounts.models import Employee
from apps.accounts.permissions import IsAdmin, IsFieldAssistant, IsActiveEmployee
from apps.audit.services import AuditService

class TodayAttendanceView(APIView):
    permission_classes = [IsAuthenticated, IsActiveEmployee]

    def get(self, request):
        employee = getattr(request.user, 'employee_profile', None)
        if not employee:
            return Response({'detail': 'No employee profile associated with this account.'}, status=status.HTTP_400_BAD_REQUEST)

        summary = AttendanceService.get_today_summary(employee)
        attendance_data = AttendanceSerializer(summary['attendance']).data if summary['attendance'] else None

        return Response({
            'server_datetime': summary['server_datetime'],
            'server_date': summary['server_date'],
            'server_time_display': summary['server_time_display'],
            'is_checked_in': summary['is_checked_in'],
            'is_checked_out': summary['is_checked_out'],
            'live_duration_minutes': summary['live_duration_minutes'],
            'live_duration_display': summary['live_duration_display'],
            'missed_checkout': summary['missed_checkout'],
            'attendance': attendance_data
        })


class CheckInView(APIView):
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def post(self, request):
        employee = request.user.employee_profile
        serializer = CheckInRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gps_data = serializer.validated_data

        attendance = AttendanceService.check_in(
            employee,
            request=request,
            latitude=gps_data.get('latitude'),
            longitude=gps_data.get('longitude'),
            accuracy=gps_data.get('accuracy'),
            address=gps_data.get('address')
        )
        time_str = format_time_display(attendance.check_in_time)

        return Response({
            'detail': f"Check-in successful at {time_str}.",
            'attendance': AttendanceSerializer(attendance).data
        }, status=status.HTTP_201_CREATED)


class CheckOutView(APIView):
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def post(self, request):
        employee = request.user.employee_profile
        serializer = CheckOutRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gps_data = serializer.validated_data

        attendance = AttendanceService.check_out(
            employee,
            request=request,
            latitude=gps_data.get('latitude'),
            longitude=gps_data.get('longitude'),
            accuracy=gps_data.get('accuracy'),
            address=gps_data.get('address')
        )
        time_str = format_time_display(attendance.check_out_time)

        return Response({
            'detail': f"Check-out successful at {time_str}.",
            'attendance': AttendanceSerializer(attendance).data
        }, status=status.HTTP_200_OK)


class MyAttendanceHistoryView(generics.ListAPIView):
    """
    List personal attendance history strictly scoped to the requesting Field Assistant.
    """
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def get_queryset(self):
        employee = self.request.user.employee_profile
        qs = Attendance.objects.filter(employee=employee).order_by('-attendance_date')

        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month:
            qs = qs.filter(attendance_date__month=month)
        if year:
            qs = qs.filter(attendance_date__year=year)

        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(attendance_date__gte=start_date)
        if end_date:
            qs = qs.filter(attendance_date__lte=end_date)

        return qs


class MyAttendanceCalendarView(APIView):
    """
    Working-day aware personal attendance calendar for a month.

    Returns one entry per configured working day, including working days that
    have no attendance record at all, so the assistant can be offered a manual
    request for a missed check-in as well as a missed check-out.
    """
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def get(self, request):
        today = get_dhaka_date()

        month = request.query_params.get('month')
        year = request.query_params.get('year')
        try:
            month = int(month) if month else today.month
            year = int(year) if year else today.year
        except (TypeError, ValueError):
            raise ValidationError({"detail": "month and year must be integers."})

        if not 1 <= month <= 12:
            raise ValidationError({"detail": "month must be between 1 and 12."})
        if not 2000 <= year <= 2100:
            raise ValidationError({"detail": "year must be between 2000 and 2100."})

        employee = request.user.employee_profile
        return Response(AttendanceService.get_monthly_calendar(employee, year, month))


class AdminAttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Administrator viewset for reviewing all employee attendance records with filters.
    """
    queryset = Attendance.objects.select_related('employee', 'employee__department', 'approved_by').all().order_by('-attendance_date', '-check_in_time')
    serializer_class = AttendanceSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(attendance_date=date)

        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month:
            qs = qs.filter(attendance_date__month=month)
        if year:
            qs = qs.filter(attendance_date__year=year)

        employee_id = self.request.query_params.get('employee_id')
        if employee_id:
            qs = qs.filter(employee__employee_id=employee_id)

        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        att_type = self.request.query_params.get('attendance_type')
        if att_type:
            qs = qs.filter(attendance_type=att_type)

        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(employee__department_id=department)

        return qs


class AttendanceSettingView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        setting = AttendanceSetting.get_active()
        return Response(AttendanceSettingSerializer(setting).data)

    def patch(self, request):
        setting = AttendanceSetting.get_active()
        old_state = AttendanceSettingSerializer(setting).data
        serializer = AttendanceSettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_setting = serializer.save(updated_by=request.user)

        AuditService.log(
            user=request.user,
            action='SETTING_UPDATED',
            object_type='AttendanceSetting',
            object_id=updated_setting.id,
            request=request,
            previous_state=old_state,
            new_state=serializer.data,
            remarks="Updated company attendance rules and shift configuration."
        )

        return Response(serializer.data)


class AdminResetDutyView(APIView):
    """
    Administrator endpoint to reset today's duty for a single Field Assistant or all Field Assistants.
    Allows staff to re-check in afresh.
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        employee_id = request.data.get('employee_id')
        employee = None
        if employee_id and employee_id != 'ALL':
            employee = get_object_or_404(Employee, employee_id=employee_id)

        count = AttendanceService.reset_today_attendance(
            employee=employee,
            request=request,
            admin_user=request.user
        )

        msg = (
            f"Successfully reset duty for {employee.user.get_full_name() or employee.employee_id}."
            if employee
            else f"Successfully reset duty for {count} field assistant(s) for today."
        )

        return Response({
            'detail': msg,
            'count': count
        }, status=status.HTTP_200_OK)


class EmployeeScheduleViewSet(viewsets.ViewSet):
    """
    Admin CRUD for an employee's standing weekly duty pattern.

    Exposes the same shape for every verb so the admin UI can render a single
    editable week: GET returns the effective seven-day pattern (including
    company-default rows), PUT replaces the stored rows, DELETE resets the
    employee back to the company working week.
    """
    permission_classes = [IsAdmin]
    serializer_class = EmployeeScheduleBulkSerializer

    def _get_employee(self, pk):
        return get_object_or_404(Employee, pk=pk)

    def _serialize(self, employee):
        return {
            'employee_id': employee.pk,
            'employee_code': employee.employee_id,
            'employee_name': employee.user.get_full_name(),
            'days': ScheduleService.get_weekly_rows(employee),
        }

    def list(self, request):
        """Returns the effective pattern for every active employee."""
        employees = Employee.objects.filter(is_active=True).select_related('user')
        return Response({'employees': [self._serialize(e) for e in employees]})

    def retrieve(self, request, pk=None):
        employee = self._get_employee(pk)
        return Response(self._serialize(employee))

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = get_object_or_404(
            Employee, pk=serializer.validated_data.get('employee_id')
        )
        try:
            ScheduleService.save_weekly(
                employee, serializer.validated_data['days'], admin_user=request.user
            )
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)})
        return Response(
            {'detail': f"Schedule updated for {employee.employee_id}.", **self._serialize(employee)},
            status=status.HTTP_200_OK,
        )

    def update(self, request, pk=None, partial=False):
        return self.create(request)

    def destroy(self, request, pk=None):
        employee = self._get_employee(pk)
        ScheduleService.reset_to_defaults(employee, admin_user=request.user)
        return Response({
            'detail': f"Schedule reset to company defaults for {employee.employee_id}.",
            **self._serialize(employee),
        })
