from django.db import models
from django.conf import settings

class AuditLog(models.Model):
    class Action(models.TextChoices):
        CHECK_IN = 'CHECK_IN', 'Check In'
        CHECK_OUT = 'CHECK_OUT', 'Check Out'
        MANUAL_REQUEST_CREATED = 'MANUAL_REQUEST_CREATED', 'Manual Request Created'
        MANUAL_REQUEST_APPROVED = 'MANUAL_REQUEST_APPROVED', 'Manual Request Approved'
        MANUAL_REQUEST_REJECTED = 'MANUAL_REQUEST_REJECTED', 'Manual Request Rejected'
        ATTENDANCE_UPDATED = 'ATTENDANCE_UPDATED', 'Attendance Updated'
        USER_LOGIN = 'USER_LOGIN', 'User Login'
        PIN_LOGIN = 'PIN_LOGIN', 'PIN Login'
        PIN_LOGIN_FAILED = 'PIN_LOGIN_FAILED', 'PIN Login Failed'
        USER_CREATED = 'USER_CREATED', 'User Created'
        USER_DISABLED = 'USER_DISABLED', 'User Disabled'
        USER_ACTIVATED = 'USER_ACTIVATED', 'User Activated'
        USER_UPDATED = 'USER_UPDATED', 'User Updated'
        SETTING_UPDATED = 'SETTING_UPDATED', 'Setting Updated'
        SCHEDULE_UPDATE = 'SCHEDULE_UPDATE', 'Schedule Updated'
        SCHEDULE_RESET = 'SCHEDULE_RESET', 'Schedule Reset'
        ATTENDANCE_APPROVED = 'ATTENDANCE_APPROVED', 'Attendance Approved'
        ATTENDANCE_REJECTED = 'ATTENDANCE_REJECTED', 'Attendance Rejected'
        ATTENDANCE_VOIDED = 'ATTENDANCE_VOIDED', 'Attendance Voided'
        ATTENDANCE_BULK_APPROVED = 'ATTENDANCE_BULK_APPROVED', 'Attendance Bulk Approved'
        LEAVE_REQUEST_SUBMITTED = 'LEAVE_REQUEST_SUBMITTED', 'Leave Request Submitted'
        LEAVE_REQUEST_APPROVED = 'LEAVE_REQUEST_APPROVED', 'Leave Request Approved'
        LEAVE_REQUEST_REJECTED = 'LEAVE_REQUEST_REJECTED', 'Leave Request Rejected'
        HOLIDAY_CREATED = 'HOLIDAY_CREATED', 'Holiday Created'
        HOLIDAY_DELETED = 'HOLIDAY_DELETED', 'Holiday Deleted'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=60, choices=Action.choices, db_index=True)
    object_type = models.CharField(max_length=60, db_index=True)
    object_id = models.CharField(max_length=60, db_index=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default='')
    previous_state = models.JSONField(null=True, blank=True)
    new_state = models.JSONField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['object_type', 'object_id']),
            models.Index(fields=['timestamp']),
        ]

    def __str__(self):
        username = self.user.username if self.user else "System"
        return f"[{self.timestamp:%Y-%m-%d %H:%M:%S}] {username} -> {self.action} on {self.object_type}:{self.object_id}"
