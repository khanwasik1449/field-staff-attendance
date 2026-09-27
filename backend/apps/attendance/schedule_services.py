"""
Domain logic for per-employee weekly duty schedules.

This module owns the 'Day Schedule' column of the monthly attendance calendar
(G / WH / X / PH) plus the derived IN and OUT status columns. It is kept
separate from apps/attendance/services.py because schedule resolution is a
distinct concern that several call sites (attendance service, manual request
validation, admin CRUD) need without importing the whole attendance service.
"""
from datetime import date, datetime, time, timedelta
import zoneinfo

from django.db import transaction

from .models import AttendanceSetting, EmployeeSchedule, ISO_WEEKDAYS

_FALLBACK_TZ = zoneinfo.ZoneInfo('Asia/Dhaka')


def _business_tz():
    """The configured company timezone, defaulting to Asia/Dhaka if unusable."""
    try:
        return zoneinfo.ZoneInfo(AttendanceSetting.get_active().timezone)
    except Exception:
        return _FALLBACK_TZ

# Synthetic codes that are derived rather than stored on EmployeeSchedule.
# Only G / WH / X are assignable per employee; PH and LV come from the
# Holiday and LeaveRequest tables and always win over a stored pattern.
CODE_HOLIDAY = 'PH'
CODE_LEAVE = 'LV'

_LABELS = {
    EmployeeSchedule.DayType.WORK_FROM_HOME: 'WH =Work from Home',
    EmployeeSchedule.DayType.WEEKLY_OFF: 'X =Weekly Off',
    CODE_HOLIDAY: 'PH =Public Holiday',
    CODE_LEAVE: 'LV =Approved Leave',
}

# Label text without the leading code, for UIs that render the code as a chip.
_SHORT_LABELS = {
    EmployeeSchedule.DayType.WORK_FROM_HOME: 'Work from Home',
    EmployeeSchedule.DayType.WEEKLY_OFF: 'Weekly Off',
    CODE_HOLIDAY: 'Public Holiday',
    CODE_LEAVE: 'Approved Leave',
}


def format_clock(t):
    """Renders a time as 12-hour clock text, e.g. 08:30 -> '08:30 AM'."""
    if t is None:
        return ''
    return t.strftime('%I:%M %p')


def format_shift_hours(start, end):
    """Renders a shift window exactly as the register does, e.g. '08:30 AM-05:00 PM'."""
    if not start or not end:
        return ''
    return f"{format_clock(start)}-{format_clock(end)}"


def _general_label(start, end):
    hours = format_shift_hours(start, end)
    return f"G ({hours})" if hours else 'G'


def _short_label(code, start, end):
    """Label text without the code prefix, e.g. 'G (08:30 AM-04:00 PM)' -> '08:30 AM-04:00 PM'."""
    if code == EmployeeSchedule.DayType.GENERAL:
        return format_shift_hours(start, end) or 'General'
    return _SHORT_LABELS.get(code, code)


def _holiday_names_for(employee, start, end):
    """
    Maps date -> holiday name for the given range. Imported lazily because the
    leaves app imports attendance models and a module-level import would cycle.
    """
    from apps.leaves.models import Holiday

    return {
        h.date: h.name
        for h in Holiday.objects.filter(date__range=(start, end))
    }


def _approved_leave_dates(employee, start, end):
    """
    Maps date -> 'Leave Type' for days covered by an APPROVED LeaveRequest.
    Imported lazily for the same reason as _holiday_names_for.
    """
    from apps.leaves.models import LeaveRequest

    if not employee or not employee.pk:
        return {}

    overlapping = LeaveRequest.objects.filter(
        employee=employee,
        status=LeaveRequest.Status.APPROVED,
        start_date__lte=end,
        end_date__gte=start,
    )

    covered = {}
    for lv in overlapping:
        cursor = max(lv.start_date, start)
        stop = min(lv.end_date, end)
        label = (lv.leave_type or 'Leave').replace('_', ' ').title()
        while cursor <= stop:
            covered.setdefault(cursor, label)
            cursor += timedelta(days=1)
    return covered


class ScheduleService:
    """
    Resolves a single date into a schedule descriptor and derives the IN/OUT
    status columns from it. Every method is server-side: the client must never
    re-derive schedule or lateness, per the server-timestamp authority rule.
    """

    @staticmethod
    def build_context(employee, start, end, setting=None):
        """
        Loads everything schedule resolution needs for a date range in three
        queries, so resolving 90 days costs the same as resolving one.
        """
        if setting is None:
            setting = AttendanceSetting.get_active()
        return {
            'holidays': _holiday_names_for(None, start, end),
            'leaves': _approved_leave_dates(employee, start, end),
            'rows_by_weekday': {
                s.weekday: s
                for s in EmployeeSchedule.objects.filter(employee=employee)
            },
        }

    @staticmethod
    def resolve_range(employee, start, end, setting=None):
        """
        Resolves every date in [start, end] inclusive, oldest first, using a
        single pre-fetched context.
        """
        if setting is None:
            setting = AttendanceSetting.get_active()
        context = ScheduleService.build_context(employee, start, end, setting=setting)
        days = []
        cursor = start
        while cursor <= end:
            days.append(
                ScheduleService.get_day_schedule(
                    employee, cursor, setting=setting, context=context
                )
            )
            cursor += timedelta(days=1)
        return days

    @staticmethod
    def get_weekly_rows(employee):
        """
        Returns exactly seven descriptors for the employee, Monday-first, filling
        gaps from the company-wide AttendanceSetting so a partially configured
        employee still produces a complete, usable pattern.
        """
        setting = AttendanceSetting.get_active()
        stored = {
            s.weekday: s
            for s in EmployeeSchedule.objects.filter(employee=employee)
        }

        rows = []
        for weekday in range(1, 8):
            row = stored.get(weekday)
            if row is not None:
                start = row.start_time
                end = row.end_time
                if row.day_type == EmployeeSchedule.DayType.GENERAL:
                    code = 'G'
                    label = _general_label(start, end)
                else:
                    code = row.day_type
                    label = _LABELS.get(code, code)
                is_working = row.day_type in (
                    EmployeeSchedule.DayType.GENERAL,
                    EmployeeSchedule.DayType.WORK_FROM_HOME,
                )
                source = 'SCHEDULE'
            else:
                # Fallback: the company-wide working week, with the official
                # shift hours applied to days that count as working.
                if weekday in setting.working_weekdays:
                    code = 'G'
                    start, end = setting.work_start_time, setting.work_end_time
                    label = _general_label(start, end)
                    is_working = True
                else:
                    code = EmployeeSchedule.DayType.WEEKLY_OFF
                    start, end = None, None
                    label = _LABELS[EmployeeSchedule.DayType.WEEKLY_OFF]
                    is_working = False
                source = 'DEFAULT'

            rows.append({
                'weekday': weekday,
                'weekday_name': ISO_WEEKDAYS[weekday],
                'code': code,
                'label': label,
                'is_working': is_working,
                'start_time': format_clock(start),
                'end_time': format_clock(end),
                'configured': row is not None,
                'source': source,
            })
        return rows

    @staticmethod
    def get_day_schedule(employee, on_date, setting=None, context=None):
        """
        Resolves one date into a schedule descriptor.

        Precedence is fixed and intentional:
            Holiday > approved Leave > per-employee row > company default
        so a declared public holiday can never be overridden by a stored duty
        pattern, and a stored pattern can never contradict a booked leave.

        Pass context= (see build_context) when resolving a range of dates.
        """
        if setting is None:
            setting = AttendanceSetting.get_active()

        # A caller resolving many consecutive days passes a pre-fetched context
        # (see build_context) so this stays O(1) queries per range instead of
        # issuing a Holiday, LeaveRequest and EmployeeSchedule query per day.
        if context is None:
            context = ScheduleService.build_context(
                employee, on_date, on_date, setting=setting
            )
        holidays = context['holidays']
        leaves = context['leaves']
        rows_by_weekday = context['rows_by_weekday']

        holiday_name = holidays.get(on_date)
        if holiday_name:
            return {
                'date': str(on_date),
                'code': CODE_HOLIDAY,
                'label': _LABELS[CODE_HOLIDAY],
                'short_label': _SHORT_LABELS[CODE_HOLIDAY],
                'name': holiday_name,
                'is_working': False,
                'start_time': None,
                'end_time': None,
                '_start_time_obj': None,
                '_end_time_obj': None,
                'source': 'HOLIDAY',
            }

        leave_name = leaves.get(on_date)
        if leave_name:
            return {
                'date': str(on_date),
                'code': CODE_LEAVE,
                'label': _LABELS[CODE_LEAVE],
                'short_label': _SHORT_LABELS[CODE_LEAVE],
                'name': leave_name,
                'is_working': False,
                'start_time': None,
                'end_time': None,
                '_start_time_obj': None,
                '_end_time_obj': None,
                'source': 'LEAVE',
            }

        weekday = on_date.isoweekday()
        row = rows_by_weekday.get(weekday)

        if row is not None:
            code = row.day_type
            if code == EmployeeSchedule.DayType.GENERAL:
                label = _general_label(row.start_time, row.end_time)
            else:
                label = _LABELS.get(code, code)
            is_working = code in (
                EmployeeSchedule.DayType.GENERAL,
                EmployeeSchedule.DayType.WORK_FROM_HOME,
            )
            start, end, source = row.start_time, row.end_time, 'SCHEDULE'
        else:
            if weekday in setting.working_weekdays:
                code = 'G'
                start, end = setting.work_start_time, setting.work_end_time
                is_working = True
            else:
                code = EmployeeSchedule.DayType.WEEKLY_OFF
                start, end, is_working = None, None, False
            label = _general_label(start, end) if is_working else _LABELS[code]
            source = 'DEFAULT'

        return {
            'date': str(on_date),
            'code': code,
            'label': label,
            'short_label': _short_label(code, start, end),
            'name': None,
            'is_working': is_working,
            'start_time': format_clock(start) or None,
            'end_time': format_clock(end) or None,
            # Raw time objects, consumed by get_in_status / get_out_offset_minutes.
            # Prefixed with an underscore so the serializer can exclude them.
            '_start_time_obj': start,
            '_end_time_obj': end,
            'source': source,
        }

    @staticmethod
    def is_working_day(employee, on_date, setting=None):
        """
        The single authority for "did this employee owe attendance on this day".
        Replaces the company-wide AttendanceSetting.is_working_day at every
        call site that concerns one specific employee.
        """
        if setting is None:
            setting = AttendanceSetting.get_active()
        return ScheduleService.get_day_schedule(
            employee, on_date, setting=setting
        )['is_working']

    @staticmethod
    def _localize(moment):
        """
        Returns a datetime in the configured business timezone. Stored attendance
        timestamps are UTC-aware while schedule times are wall-clock in the
        business timezone, so both status helpers must compare in that frame.

        Resolved from AttendanceSetting directly rather than imported from
        services.py, which would create an import cycle.
        """
        tz = _business_tz()
        if moment.tzinfo is None:
            return moment.replace(tzinfo=tz)
        return moment.astimezone(tz)

    @staticmethod
    def get_in_status(check_in_dt, schedule, setting=None):
        """
        IN status column: 0 when check-in landed on or before the late cutoff,
        -1 when it landed after. Returns None when there is nothing to judge.

        The cutoff is the scheduled start plus the company late_grace_minutes,
        mirroring how AttendanceService.check_in decides PRESENT vs LATE. A day
        with no scheduled start (for example a work-from-home day with no fixed
        hours) is never late.
        """
        if check_in_dt is None or not schedule or not schedule.get('is_working'):
            return None

        start = schedule.get('_start_time_obj')
        if start is None:
            return 0

        if setting is None:
            setting = AttendanceSetting.get_active()

        local_in = ScheduleService._localize(check_in_dt)
        cutoff_naive = datetime.combine(local_in.date(), start) + timedelta(
            minutes=setting.late_grace_minutes
        )
        cutoff_dt = ScheduleService._localize(cutoff_naive)
        return 0 if local_in <= cutoff_dt else -1

    @staticmethod
    def get_out_offset_minutes(check_out_dt, schedule):
        """
        OUT status column: signed minutes against the scheduled end.

        Sign convention matches the register - a late departure is negative and
        an early departure is positive, i.e. the value is
        (scheduled_end - actual_check_out) in whole minutes. Returns None when
        there is no check-out or no scheduled end to compare against.
        """
        if check_out_dt is None or not schedule or not schedule.get('is_working'):
            return None

        end = schedule.get('_end_time_obj')
        if end is None:
            return None

        local_out = ScheduleService._localize(check_out_dt)
        target = ScheduleService._localize(
            datetime.combine(local_out.date(), end)
        )
        return int((target - local_out).total_seconds() // 60)

    @staticmethod
    @transaction.atomic
    def save_weekly(employee, rows, admin_user=None):
        """
        Replaces the employee's stored weekly pattern from a list of weekday
        payloads and writes an immutable audit entry per changed weekday.

        A payload is {'weekday': int, 'day_type': 'G'|'WH'|'X',
        'start_time': 'HH:MM'|None, 'end_time': 'HH:MM'|None}. Weekdays absent
        from the payload are left untouched, so a partial edit cannot silently
        wipe the rest of the pattern.
        """
        from apps.audit.services import AuditService

        if not isinstance(rows, (list, tuple)):
            raise ValueError("rows must be a list of weekday payloads.")

        valid_codes = {c for c, _ in EmployeeSchedule.DayType.choices}
        saved = []

        for payload in rows:
            if not isinstance(payload, dict):
                raise ValueError("Each schedule row must be an object.")

            weekday = payload.get('weekday')
            try:
                weekday = int(weekday)
            except (TypeError, ValueError):
                raise ValueError("Each schedule row requires an integer weekday 1-7.")
            if weekday not in ISO_WEEKDAYS:
                raise ValueError(f"Invalid weekday {weekday}; use ISO numbers 1-7.")

            day_type = payload.get('day_type') or EmployeeSchedule.DayType.GENERAL
            if day_type not in valid_codes:
                raise ValueError(
                    f"Invalid day_type '{day_type}' for {ISO_WEEKDAYS[weekday]}. "
                    f"Choose one of: {', '.join(sorted(valid_codes))}."
                )

            start = _coerce_time(payload.get('start_time'))
            end = _coerce_time(payload.get('end_time'))
            if start and end and start > end:
                raise ValueError(
                    f"{ISO_WEEKDAYS[weekday]}: start time must not be later than end time."
                )

            row, created = EmployeeSchedule.objects.select_for_update().get_or_create(
                employee=employee, weekday=weekday,
                defaults={'day_type': day_type, 'start_time': start, 'end_time': end},
            )

            # Snapshot the prior state before overwriting. get_or_create has
            # already applied the defaults on a new row, so `created` is what
            # distinguishes a genuine first-time assignment from a no-op write.
            previous = None
            if not created:
                previous = f"{row.day_type} {format_shift_hours(row.start_time, row.end_time)}".strip()

            changed = created or (
                row.day_type != day_type
                or row.start_time != start
                or row.end_time != end
            )

            row.day_type = day_type
            row.start_time = start
            row.end_time = end
            row.updated_by = admin_user
            row.save(update_fields=['day_type', 'start_time', 'end_time', 'updated_by', 'updated_at'])

            if changed:
                AuditService.log(
                    user=admin_user,
                    action='SCHEDULE_UPDATE',
                    object_type='EmployeeSchedule',
                    object_id=f"{employee.pk}:{weekday}",
                    previous_state=previous,
                    new_state=f"{day_type} {format_shift_hours(start, end)}".strip(),
                    remarks=f"Updated {ISO_WEEKDAYS[weekday]} schedule for {employee.employee_id}.",
                )
            saved.append(row)

        return saved

    @staticmethod
    @transaction.atomic
    def reset_to_defaults(employee, admin_user=None):
        """
        Deletes the stored pattern so the employee falls back to the
        company-wide working week. Audited as a whole because the effect is
        per-employee rather than per-weekday.
        """
        from apps.audit.services import AuditService

        count = EmployeeSchedule.objects.filter(employee=employee).count()
        if count:
            EmployeeSchedule.objects.filter(employee=employee).delete()
            AuditService.log(
                user=admin_user,
                action='SCHEDULE_RESET',
                object_type='EmployeeSchedule',
                object_id=employee.pk,
                previous_state=f"{count} configured weekday(s)",
                new_state='DEFAULT (company working week)',
                remarks=f"Reset schedule for {employee.employee_id} to company defaults.",
            )
        return ScheduleService.get_weekly_rows(employee)


def _coerce_time(value):
    """
    Accepts 'HH:MM' / 'HH:MM:SS' / datetime.time / None and returns a time or
    None. Blank strings are treated as 'not set' so the UI can clear a time.
    """
    if value in (None, ''):
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, datetime):
        return value.time()
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        raise ValueError(f"Invalid time '{value}'. Use HH:MM or HH:MM:SS.")
