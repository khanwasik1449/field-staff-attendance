from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.accounts.models import Employee

# ISO-8601 weekday numbers: 1=Monday ... 7=Sunday
ISO_WEEKDAYS = {1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
                5: 'Friday', 6: 'Saturday', 7: 'Sunday'}


def parse_work_days(raw):
    """
    Parses a comma-separated ISO weekday list (e.g. '1,2,3,4,5') into a sorted
    tuple of ints. Raises ValidationError on anything malformed so bad data can
    never reach the business logic.
    """
    if raw is None or not str(raw).strip():
        return ()
    try:
        days = tuple(sorted({int(part.strip()) for part in str(raw).split(',') if part.strip()}))
    except (TypeError, ValueError):
        raise ValidationError("work_days must be a comma-separated list of ISO weekday numbers 1-7.")
    invalid = [d for d in days if d not in ISO_WEEKDAYS]
    if invalid:
        raise ValidationError(f"Invalid ISO weekday number(s): {', '.join(map(str, invalid))}. Use 1-7.")
    return days


class AttendanceSetting(models.Model):
    """
    Dynamic configuration for attendance rules to eliminate hardcoded business logic.
    """
    work_start_time = models.TimeField(default='09:00:00', help_text="Official shift start time")
    work_end_time = models.TimeField(default='17:00:00', help_text="Official shift end time")
    work_days = models.CharField(
        default='1,2,3,4,7',
        max_length=20,
        validators=[parse_work_days],
        help_text=(
            "Comma-separated ISO weekday numbers treated as working days "
            "(1=Monday ... 7=Sunday). Drives which days require attendance and "
            "which days are eligible for a missed check-in request. "
            "Default is Sun-Thu (Friday and Saturday are weekly offs)."
        )
    )
    late_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Minutes after work_start_time before an attendance is marked LATE"
    )
    half_day_minimum_minutes = models.PositiveIntegerField(
        default=240,
        help_text="Minimum working duration for a half-day (in minutes)"
    )
    full_day_minimum_minutes = models.PositiveIntegerField(
        default=480,
        help_text="Minimum working duration for a full day (in minutes)"
    )
    timezone = models.CharField(
        max_length=50,
        default='Asia/Dhaka',
        help_text="Official company attendance timezone"
    )
    require_gps = models.BooleanField(
        default=False,
        help_text="Require GPS coordinates during mobile check-in/out"
    )
    enforce_geofence = models.BooleanField(
        default=False,
        help_text="Strictly block check-in outside authorized site radius"
    )
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Attendance Setting"
        verbose_name_plural = "Attendance Settings"

    @classmethod
    def get_active(cls):
        setting = cls.objects.filter(is_active=True).order_by('-updated_at').first()
        if not setting:
            setting = cls.objects.create()
        return setting

    def clean(self):
        super().clean()
        # Re-validates work_days through the field validators.
        parse_work_days(self.work_days)

    @property
    def working_weekdays(self):
        return parse_work_days(self.work_days)

    def is_working_day(self, date):
        """True when the given date falls on a configured working day."""
        return date.isoweekday() in self.working_weekdays

    def working_days_in_range(self, start_date, end_date):
        """
        Yields each configured working day between start_date and end_date
        inclusive. This is the authoritative calendar - clients must never
        re-derive working days themselves.
        """
        working = self.working_weekdays
        if not working:
            return []
        days = []
        cursor = start_date
        while cursor <= end_date:
            if cursor.isoweekday() in working:
                days.append(cursor)
            cursor += timezone.timedelta(days=1)
        return days


class Attendance(models.Model):
    class Type(models.TextChoices):
        AUTOMATIC = 'AUTOMATIC', 'Automatic'
        MANUAL = 'MANUAL', 'Manual'

    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        LATE = 'LATE', 'Late'
        INCOMPLETE = 'INCOMPLETE', 'Incomplete'
        ABSENT = 'ABSENT', 'Absent'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='attendances'
    )
    attendance_date = models.DateField(
        db_index=True,
        help_text="Calendar date of attendance in Asia/Dhaka timezone"
    )
    check_in_time = models.DateTimeField(
        help_text="Server-side recorded check-in timestamp"
    )
    check_out_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Server-side recorded check-out timestamp"
    )
    working_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total elapsed working duration in minutes"
    )
    attendance_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.AUTOMATIC,
        db_index=True
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PRESENT,
        db_index=True
    )

    # GPS Location & Geofencing fields
    check_in_latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Latitude captured at check-in"
    )
    check_in_longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Longitude captured at check-in"
    )
    check_in_accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="GPS accuracy in meters at check-in"
    )
    check_in_distance_meters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Distance in meters from assigned project site at check-in"
    )
    check_in_is_geofence_violation = models.BooleanField(
        default=False,
        help_text="True if check-in was outside project geofence perimeter"
    )
    check_in_address = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Human-readable physical location address at check-in"
    )

    check_out_latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Latitude captured at check-out"
    )
    check_out_longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Longitude captured at check-out"
    )
    check_out_accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="GPS accuracy in meters at check-out"
    )
    check_out_distance_meters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Distance in meters from assigned project site at check-out"
    )
    check_out_is_geofence_violation = models.BooleanField(
        default=False,
        help_text="True if check-out was outside project geofence perimeter"
    )
    check_out_address = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Human-readable physical location address at check-out"
    )

    # Manual Approval Traceability fields
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_attendances'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True, default='')
    manual_request = models.OneToOneField(
        'requests.ManualAttendanceRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resulting_attendance'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-attendance_date', '-check_in_time']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'attendance_date'],
                name='unique_employee_attendance_date'
            )
        ]
        indexes = [
            models.Index(fields=['attendance_date', 'status']),
            models.Index(fields=['employee', 'attendance_date']),
            models.Index(fields=['attendance_type']),
        ]

    def __str__(self):
        return f"{self.employee.employee_id} - {self.attendance_date} ({self.status})"


class EmployeeSchedule(models.Model):
    """
    A standing weekly duty pattern for a single employee, one row per ISO weekday.

    This is the authoritative source for the 'Day Schedule' column of the monthly
    attendance calendar (G / WH / X). It is intentionally NOT effective-dated: a
    pattern is standing until an administrator edits it. Where an employee has no
    row for a weekday the ScheduleService falls back to the company-wide
    AttendanceSetting (work_days + work_start_time + work_end_time), so partial
    configuration always yields a usable schedule.
    """

    class DayType(models.TextChoices):
        GENERAL = 'G', 'General (Office)'
        WORK_FROM_HOME = 'WH', 'Work from Home'
        WEEKLY_OFF = 'X', 'Weekly Off'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='schedules'
    )
    weekday = models.PositiveSmallIntegerField(
        choices=[(d, name) for d, name in sorted(ISO_WEEKDAYS.items())],
        help_text="ISO weekday number (1=Monday ... 7=Sunday)"
    )
    day_type = models.CharField(
        max_length=2,
        choices=DayType.choices,
        default=DayType.GENERAL,
        db_index=True
    )
    start_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Scheduled start time. Used for GENERAL days to compute the late cutoff."
    )
    end_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Scheduled end time. Used to compute the OUT offset."
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['weekday']
        verbose_name = "Employee Schedule"
        verbose_name_plural = "Employee Schedules"
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'weekday'],
                name='unique_employee_schedule_weekday'
            ),
            models.CheckConstraint(
                condition=models.Q(weekday__gte=1, weekday__lte=7),
                name='employee_schedule_weekday_range'
            )
        ]
        indexes = [
            models.Index(fields=['employee', 'weekday']),
        ]

    def clean(self):
        super().clean()
        if self.weekday not in ISO_WEEKDAYS:
            raise ValidationError("weekday must be an ISO weekday number between 1 and 7.")
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValidationError("start_time must not be later than end_time.")

    def __str__(self):
        return f"{self.employee.employee_id} - {ISO_WEEKDAYS[self.weekday]} ({self.day_type})"
