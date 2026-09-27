from django.db import models
from django.conf import settings
from apps.accounts.models import Employee

class ManualAttendanceRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    class RequestType(models.TextChoices):
        MISSED_CHECK_IN = 'MISSED_CHECK_IN', 'Missed Check-In'
        MISSED_CHECK_OUT = 'MISSED_CHECK_OUT', 'Missed Check-Out'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='manual_requests'
    )
    attendance_date = models.DateField(
        db_index=True,
        help_text="The date for which manual attendance is requested"
    )
    request_type = models.CharField(
        max_length=20,
        choices=RequestType.choices,
        default=RequestType.MISSED_CHECK_IN,
        db_index=True,
        help_text=(
            "MISSED_CHECK_IN: the assistant never checked in, so both times are "
            "supplied and the duty day is created. MISSED_CHECK_OUT: the assistant "
            "already checked in successfully and only the check-out is supplied; "
            "the existing server-recorded check-in is preserved untouched."
        )
    )
    requested_check_in = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Server-side check-in requested by the assistant. Null for "
            "MISSED_CHECK_OUT, where the existing automatic check-in is kept."
        )
    )
    requested_check_out = models.DateTimeField()
    reason = models.TextField(
        help_text="Reason for missing automatic check-in/out"
    )
    remarks = models.TextField(
        blank=True,
        default='',
        help_text="Optional employee remarks"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_manual_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'attendance_date']),
            models.Index(fields=['employee', 'status']),
        ]

    def __str__(self):
        return f"Req #{self.id} - {self.employee.employee_id} ({self.attendance_date}) - {self.status}"
