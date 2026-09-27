from datetime import datetime, time, timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from .models import ManualAttendanceRequest
from apps.attendance.models import Attendance, AttendanceSetting
from apps.attendance.schedule_services import ScheduleService
from apps.attendance.services import (
    ConflictException,
    get_dhaka_datetime,
    format_time_display,
    get_server_timezone
)
from apps.audit.services import AuditService

class ManualRequestService:
    @staticmethod
    def create_request(
        employee,
        attendance_date,
        requested_check_out,
        reason,
        request_type=ManualAttendanceRequest.RequestType.MISSED_CHECK_IN,
        requested_check_in=None,
        remarks='',
        request=None
    ):
        """
        Creates a manual attendance request.

        Two distinct shapes are supported, because the underlying attendance
        state differs:

        MISSED_CHECK_IN
            No attendance record exists for the day. Both times are supplied and
            approval creates the duty day. Only allowed on configured working
            days - nothing was missed otherwise.

        MISSED_CHECK_OUT
            A record already exists with a valid server-recorded check-in. Only
            the check-out time is supplied; approval closes the existing record
            and leaves the original check-in (and its GPS provenance) untouched.
        """
        valid_types = {t for t, _ in ManualAttendanceRequest.RequestType.choices}
        if request_type not in valid_types:
            raise serializers.ValidationError(
                {"detail": f"Unknown request_type '{request_type}'. Must be one of: {', '.join(sorted(valid_types))}."}
            )

        today = get_dhaka_datetime().date()
        if attendance_date > today:
            raise serializers.ValidationError(
                {"detail": "Cannot request manual attendance for a future date."}
            )

        setting = AttendanceSetting.get_active()
        existing_attendance = Attendance.objects.filter(
            employee=employee, attendance_date=attendance_date
        ).first()

        if request_type == ManualAttendanceRequest.RequestType.MISSED_CHECK_IN:
            # Resolved from the employee's own schedule, not the company-wide
            # working week, so a weekly off or holiday day is never claimable.
            if not ScheduleService.is_working_day(employee, attendance_date, setting=setting):
                raise serializers.ValidationError(
                    {"detail": f"{attendance_date.strftime('%A')} is not a working day in your schedule, so no check-in was missed."}
                )
            if existing_attendance is not None:
                raise ConflictException(
                    detail="An attendance record already exists for this date. Use a 'Missed Check-Out' request if only the check-out is missing."
                )
            if requested_check_in is None:
                raise serializers.ValidationError(
                    {"detail": "A check-in time is required for a missed check-in request."}
                )
            if requested_check_out <= requested_check_in:
                raise serializers.ValidationError(
                    {"detail": "Requested check-out time must be strictly after requested check-in time."}
                )

        else:  # MISSED_CHECK_OUT
            if existing_attendance is None:
                raise ConflictException(
                    detail="No attendance record exists for this date, so there is no check-out to supply. Use a 'Missed Check-In' request instead."
                )
            if existing_attendance.check_out_time is not None:
                raise ConflictException(
                    detail="This day is already checked out. Nothing is missing for this date."
                )
            if requested_check_in is not None:
                raise serializers.ValidationError(
                    {"detail": "A 'Missed Check-Out' request must not supply a check-in time. The existing server-recorded check-in is preserved."}
                )
            # The check-out must fall after the real, existing check-in.
            if requested_check_out <= existing_attendance.check_in_time:
                raise serializers.ValidationError(
                    {"detail": "Requested check-out time must be after the existing check-in time."}
                )

        # Invariant: Prevent duplicate pending requests for the same date
        existing_pending = ManualAttendanceRequest.objects.filter(
            employee=employee,
            attendance_date=attendance_date,
            status=ManualAttendanceRequest.Status.PENDING
        ).exists()

        if existing_pending:
            raise ConflictException(
                detail="A pending manual attendance request already exists for this date. Please await administrator review."
            )

        manual_req = ManualAttendanceRequest.objects.create(
            employee=employee,
            attendance_date=attendance_date,
            request_type=request_type,
            requested_check_in=requested_check_in,
            requested_check_out=requested_check_out,
            reason=reason,
            remarks=remarks or '',
            status=ManualAttendanceRequest.Status.PENDING
        )

        AuditService.log(
            user=employee.user,
            action='MANUAL_REQUEST_CREATED',
            object_type='ManualAttendanceRequest',
            object_id=manual_req.id,
            request=request,
            new_state={
                'attendance_date': str(attendance_date),
                'request_type': request_type,
                'requested_check_in': requested_check_in.isoformat() if requested_check_in else None,
                'requested_check_out': requested_check_out.isoformat(),
                'reason': reason
            },
            remarks=f"Submitted {request_type} request for {attendance_date}"
        )

        return manual_req

    @staticmethod
    def approve_request(req_id, admin_user, admin_remarks='', request=None):
        with transaction.atomic():
            manual_req = (
                ManualAttendanceRequest.objects
                .select_for_update()
                .select_related('employee')
                .filter(id=req_id)
                .first()
            )

            if not manual_req:
                raise exceptions.NotFound(detail="Manual attendance request not found.")

            if manual_req.status != ManualAttendanceRequest.Status.PENDING:
                raise serializers.ValidationError({"detail": f"Request has already been processed with status: {manual_req.status}."})

            now = get_dhaka_datetime()
            setting = AttendanceSetting.get_active()
            tz = get_server_timezone()

            # Check if an attendance record already exists for this date (e.g. Incomplete automatic record)
            attendance = (
                Attendance.objects
                .select_for_update()
                .filter(employee=manual_req.employee, attendance_date=manual_req.attendance_date)
                .first()
            )

            if manual_req.request_type == ManualAttendanceRequest.RequestType.MISSED_CHECK_OUT:
                # ---- Check-out only: close the existing record, preserve the check-in ----
                if attendance is None or attendance.check_out_time is not None:
                    raise serializers.ValidationError(
                        {"detail": "This request cannot be approved: the attendance record is missing or already checked out."}
                    )
                if manual_req.requested_check_out <= attendance.check_in_time:
                    raise serializers.ValidationError(
                        {"detail": "Requested check-out time is not after the existing check-in time."}
                    )

                duration_seconds = max(
                    0, (manual_req.requested_check_out - attendance.check_in_time).total_seconds()
                )
                duration_minutes = int(round(duration_seconds / 60))

                # Deliberately NOT re-derived: the late/present verdict belongs to
                # the original server-recorded check-in, which we are not touching.
                attendance.check_out_time = manual_req.requested_check_out
                attendance.working_duration_minutes = duration_minutes
                attendance.attendance_type = Attendance.Type.MANUAL
                # The PRESENT/LATE verdict was decided at check-in and belongs to
                # the untouched check-in time, so it is preserved. Only a stale
                # INCOMPLETE marker is repaired now that the day is closed -
                # never overwrite a genuine LATE with PRESENT.
                if attendance.status not in (
                    Attendance.Status.PRESENT, Attendance.Status.LATE
                ):
                    attendance.status = Attendance.Status.PRESENT
                attendance.approved_by = admin_user
                attendance.approved_at = now
                attendance.admin_remarks = admin_remarks or 'Approved via manual check-out request.'
                attendance.manual_request = manual_req
                attendance.save()

            else:
                # ---- Missed check-in: create or fully replace the duty day ----
                duration_seconds = max(
                    0, (manual_req.requested_check_out - manual_req.requested_check_in).total_seconds()
                )
                duration_minutes = int(round(duration_seconds / 60))

                # Determine late status
                work_start = setting.work_start_time
                dummy_date = datetime(2000, 1, 1, work_start.hour, work_start.minute, work_start.second)
                cutoff_dt = dummy_date + timedelta(minutes=setting.late_grace_minutes)

                local_check_in = manual_req.requested_check_in.astimezone(tz)
                att_status = (
                    Attendance.Status.LATE
                    if local_check_in.time() > cutoff_dt.time()
                    else Attendance.Status.PRESENT
                )

                if attendance:
                    # Update existing record
                    attendance.check_in_time = manual_req.requested_check_in
                    attendance.check_out_time = manual_req.requested_check_out
                    attendance.working_duration_minutes = duration_minutes
                    attendance.attendance_type = Attendance.Type.MANUAL
                    attendance.status = att_status
                    attendance.approved_by = admin_user
                    attendance.approved_at = now
                    attendance.admin_remarks = admin_remarks or 'Approved via manual request.'
                    attendance.manual_request = manual_req
                    attendance.save()
                else:
                    # Create fresh attendance record
                    attendance = Attendance.objects.create(
                        employee=manual_req.employee,
                        attendance_date=manual_req.attendance_date,
                        check_in_time=manual_req.requested_check_in,
                        check_out_time=manual_req.requested_check_out,
                        working_duration_minutes=duration_minutes,
                        attendance_type=Attendance.Type.MANUAL,
                        status=att_status,
                        approved_by=admin_user,
                        approved_at=now,
                        admin_remarks=admin_remarks or 'Approved via manual request.',
                        manual_request=manual_req
                    )

            # Update request status
            manual_req.status = ManualAttendanceRequest.Status.APPROVED
            manual_req.reviewed_by = admin_user
            manual_req.reviewed_at = now
            manual_req.admin_remarks = admin_remarks or ''
            manual_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='MANUAL_REQUEST_APPROVED',
                object_type='ManualAttendanceRequest',
                object_id=manual_req.id,
                request=request,
                previous_state={'status': 'PENDING'},
                new_state={'status': 'APPROVED', 'attendance_id': attendance.id},
                remarks=f"Approved {manual_req.request_type} request for {manual_req.employee.employee_id} on {manual_req.attendance_date}. Remarks: {admin_remarks}"
            )

            return manual_req

    @staticmethod
    def reject_request(req_id, admin_user, admin_remarks='', request=None):
        with transaction.atomic():
            manual_req = (
                ManualAttendanceRequest.objects
                .select_for_update()
                .filter(id=req_id)
                .first()
            )

            if not manual_req:
                raise exceptions.NotFound(detail="Manual attendance request not found.")

            if manual_req.status != ManualAttendanceRequest.Status.PENDING:
                raise serializers.ValidationError({"detail": f"Request has already been processed with status: {manual_req.status}."})

            now = get_dhaka_datetime()
            manual_req.status = ManualAttendanceRequest.Status.REJECTED
            manual_req.reviewed_by = admin_user
            manual_req.reviewed_at = now
            manual_req.admin_remarks = admin_remarks or ''
            manual_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='MANUAL_REQUEST_REJECTED',
                object_type='ManualAttendanceRequest',
                object_id=manual_req.id,
                request=request,
                previous_state={'status': 'PENDING'},
                new_state={'status': 'REJECTED'},
                remarks=f"Rejected manual attendance request for {manual_req.employee.employee_id} on {manual_req.attendance_date}. Reason: {admin_remarks}"
            )

            return manual_req
