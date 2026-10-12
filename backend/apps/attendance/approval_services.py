"""
Daily attendance approval workflow.

Every duty day must be signed off by an admin before it counts toward reports
and payroll. This service owns the three transitions and the one destructive
action, keeping them auditable and atomic:

    PENDING  --approve--> APPROVED   (counts toward reports/payroll)
    PENDING  --reject-->  REJECTED   (retained as evidence, excluded everywhere)
    REJECTED --void-->    (row deleted, date freed for a re-punch)

Attendance created by an approved correction request is born APPROVED, because
the admin already made a deliberate decision about that specific day; see
`apps.requests.services.ManualRequestService.approve_request`.
"""

from django.db import transaction
from rest_framework import serializers

from .models import Attendance
from .services import get_dhaka_datetime
from apps.audit.services import AuditService

PENDING = Attendance.ApprovalStatus.PENDING
APPROVED = Attendance.ApprovalStatus.APPROVED
REJECTED = Attendance.ApprovalStatus.REJECTED


class AttendanceApprovalService:
    """Admin sign-off transitions for individual duty days."""

    @staticmethod
    def _snapshot(att):
        """Captures the evidence needed to reconstruct a voided row from the audit trail."""
        return {
            'attendance_id': att.id,
            'employee_id': att.employee.employee_id,
            'attendance_date': str(att.attendance_date),
            'check_in_time': att.check_in_time.isoformat() if att.check_in_time else None,
            'check_out_time': att.check_out_time.isoformat() if att.check_out_time else None,
            'working_duration_minutes': att.working_duration_minutes,
            'status': att.status,
            'attendance_type': att.attendance_type,
            'approval_status': att.approval_status,
            'check_in_address': att.check_in_address,
            'check_out_address': att.check_out_address,
        }

    @staticmethod
    def _lock(attendance_id):
        att = (
            Attendance.objects.select_for_update()
            .select_related('employee', 'employee__user')
            .filter(pk=attendance_id)
            .first()
        )
        if att is None:
            raise serializers.ValidationError(
                {'detail': f'Attendance record {attendance_id} was not found.'}
            )
        return att

    @staticmethod
    def approve(attendance_id, admin_user, remarks='', request=None):
        """PENDING -> APPROVED. Idempotent-safe: re-approving is rejected loudly."""
        with transaction.atomic():
            att = AttendanceApprovalService._lock(attendance_id)

            if att.approval_status == APPROVED:
                raise serializers.ValidationError(
                    {'detail': f"Attendance for {att.employee.employee_id} on {att.attendance_date} was already approved."}
                )
            if att.approval_status == REJECTED:
                raise serializers.ValidationError(
                    {'detail': f"Attendance for {att.employee.employee_id} on {att.attendance_date} was rejected. Void it before approving a replacement."}
                )

            previous = AttendanceApprovalService._snapshot(att)
            now = get_dhaka_datetime()
            att.approval_status = APPROVED
            att.approved_by = admin_user
            att.approved_at = now
            if remarks:
                att.admin_remarks = remarks
            att.save(update_fields=[
                'approval_status', 'approved_by', 'approved_at',
                'admin_remarks', 'updated_at',
            ])

            AuditService.log(
                user=admin_user,
                action='ATTENDANCE_APPROVED',
                object_type='Attendance',
                object_id=str(att.id),
                request=request,
                previous_state=previous,
                new_state={
                    'approval_status': APPROVED,
                    'approved_by': admin_user.username if admin_user else None,
                    'approved_at': now.isoformat(),
                },
                remarks=(
                    f"Approved duty day for {att.employee.employee_id} "
                    f"({att.employee.user.username}) on {att.attendance_date}."
                    + (f" Remarks: {remarks}" if remarks else '')
                ),
            )
            return att

    @staticmethod
    def reject(attendance_id, admin_user, remarks='', request=None):
        """
        PENDING/APPROVED -> REJECTED.

        The row is retained so the punch data survives as evidence, but it is
        excluded from every report. Because (employee, attendance_date) is
        unique, the date cannot be re-punched until the row is voided.
        """
        with transaction.atomic():
            att = AttendanceApprovalService._lock(attendance_id)

            if att.approval_status == REJECTED:
                raise serializers.ValidationError(
                    {'detail': f"Attendance for {att.employee.employee_id} on {att.attendance_date} is already rejected."}
                )
            if not remarks:
                raise serializers.ValidationError(
                    {'admin_remarks': 'A reason is required when rejecting attendance.'}
                )

            previous = AttendanceApprovalService._snapshot(att)
            now = get_dhaka_datetime()
            att.approval_status = REJECTED
            att.approved_by = admin_user
            att.approved_at = now
            att.admin_remarks = remarks
            att.save(update_fields=[
                'approval_status', 'approved_by', 'approved_at',
                'admin_remarks', 'updated_at',
            ])

            AuditService.log(
                user=admin_user,
                action='ATTENDANCE_REJECTED',
                object_type='Attendance',
                object_id=str(att.id),
                request=request,
                previous_state=previous,
                new_state={
                    'approval_status': REJECTED,
                    'rejected_by': admin_user.username if admin_user else None,
                    'rejected_at': now.isoformat(),
                },
                remarks=(
                    f"Rejected duty day for {att.employee.employee_id} "
                    f"({att.employee.user.username}) on {att.attendance_date}. Reason: {remarks}"
                ),
            )
            return att

    @staticmethod
    def void(attendance_id, admin_user, remarks='', request=None):
        """
        REJECTED -> row deleted, which frees (employee, attendance_date) so the
        assistant can punch again.

        The unique constraint means a kept REJECTED row permanently blocks the
        date, so deletion is the only escape. The full prior state is written to
        the audit log first, satisfying the audit-immutability invariant.
        """
        with transaction.atomic():
            att = AttendanceApprovalService._lock(attendance_id)

            if att.approval_status != REJECTED:
                raise serializers.ValidationError(
                    {'detail': 'Only rejected attendance can be voided. Reject it first so the void is auditable.'}
                )

            previous = AttendanceApprovalService._snapshot(att)
            att.delete()

            AuditService.log(
                user=admin_user,
                action='ATTENDANCE_VOIDED',
                object_type='Attendance',
                object_id=str(attendance_id),
                request=request,
                previous_state=previous,
                new_state=None,
                remarks=(
                    f"Voided rejected duty day for {previous['employee_id']} "
                    f"on {previous['attendance_date']}; the date is available for re-punch."
                    + (f" Remarks: {remarks}" if remarks else '')
                ),
            )
            return previous

    @staticmethod
    def bulk_approve(attendance_date, admin_user, remarks='', employee_ids=None, request=None):
        """
        Approves every PENDING row for one date in a single transaction.

        Returns ``(approved_ids, skipped)`` where ``skipped`` describes rows that
        were left alone because they were no longer PENDING.
        """
        now = get_dhaka_datetime()
        approved_ids = []
        skipped = []

        with transaction.atomic():
            qs = Attendance.objects.select_for_update().filter(
                attendance_date=attendance_date,
                approval_status=PENDING,
            ).select_related('employee', 'employee__user')
            if employee_ids:
                qs = qs.filter(employee__employee_id__in=employee_ids)

            rows = list(qs)
            if not rows:
                return approved_ids, skipped

            for att in rows:
                previous = AttendanceApprovalService._snapshot(att)
                att.approval_status = APPROVED
                att.approved_by = admin_user
                att.approved_at = now
                if remarks:
                    att.admin_remarks = remarks
                att.save(update_fields=[
                    'approval_status', 'approved_by', 'approved_at',
                    'admin_remarks', 'updated_at',
                ])
                approved_ids.append(att.id)

                AuditService.log(
                    user=admin_user,
                    action='ATTENDANCE_APPROVED',
                    object_type='Attendance',
                    object_id=str(att.id),
                    request=request,
                    previous_state=previous,
                    new_state={
                        'approval_status': APPROVED,
                        'approved_by': admin_user.username if admin_user else None,
                        'approved_at': now.isoformat(),
                    },
                    remarks=(
                        f"Approved in bulk for {att.employee.employee_id} on "
                        f"{attendance_date}." + (f" Remarks: {remarks}" if remarks else '')
                    ),
                )

            AuditService.log(
                user=admin_user,
                action='ATTENDANCE_BULK_APPROVED',
                object_type='Attendance',
                object_id=str(attendance_date),
                request=request,
                previous_state={'approval_status': PENDING},
                new_state={
                    'approval_status': APPROVED,
                    'approved_count': len(approved_ids),
                    'attendance_ids': approved_ids,
                },
                remarks=(
                    f"Bulk approved {len(approved_ids)} duty day(s) for {attendance_date}."
                    + (f" Remarks: {remarks}" if remarks else '')
                ),
            )

        return approved_ids, skipped
