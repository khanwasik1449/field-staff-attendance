import zoneinfo
import math
import calendar
import urllib.request
import urllib.parse
import json
from datetime import date, datetime, time, timedelta
from django.utils import timezone
from django.db import transaction
from rest_framework import exceptions, status
from rest_framework.views import exception_handler
from rest_framework.response import Response

from .models import Attendance, AttendanceSetting, ISO_WEEKDAYS
from .schedule_services import ScheduleService
from apps.audit.services import AuditService

def get_reverse_geocoded_address(latitude, longitude):
    """
    Reverse geocodes coordinates to a concise physical address via OpenStreetMap Nominatim.
    Fails safely with a 2.5s timeout so attendance operations are never blocked.
    """
    if latitude is None or longitude is None:
        return ""
    try:
        lat = float(latitude)
        lon = float(longitude)
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=16&accept-language=en"
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'FRA-FieldResearchAssistants/1.0 (admin@fra.local)'}
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                addr = data.get('address', {})
                parts = []
                for k in ['suburb', 'neighbourhood', 'residential', 'road', 'city', 'state_district']:
                    val = addr.get(k)
                    if val and val not in parts:
                        parts.append(val)
                if parts:
                    return ", ".join(parts[:3])
                display_name = data.get('display_name', '')
                if display_name:
                    return ", ".join([p.strip() for p in display_name.split(',')[:3]])
    except Exception:
        pass
    return ""

def get_server_timezone():
    setting = AttendanceSetting.get_active()
    try:
        return zoneinfo.ZoneInfo(setting.timezone)
    except Exception:
        return zoneinfo.ZoneInfo('Asia/Dhaka')

def get_dhaka_datetime():
    tz = get_server_timezone()
    return timezone.now().astimezone(tz)

def get_dhaka_date():
    return get_dhaka_datetime().date()

def format_time_display(dt, with_seconds=False):
    if not dt:
        return ""
    tz = get_server_timezone()
    local_dt = dt.astimezone(tz) if dt.tzinfo else dt
    return local_dt.strftime("%I:%M:%S %p" if with_seconds else "%I:%M %p")

def format_duration_short(minutes):
    """
    Register-style duration, e.g. 471 -> '7:51'. Used by the monthly calendar's
    Duration column, which reads as hours:minutes rather than '7h 51m'.
    """
    if minutes is None:
        return "--"
    hours = minutes // 60
    return f"{hours}:{minutes % 60:02d}"

def format_duration_display(minutes):
    if minutes is None:
        return "--"
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours}h {mins:02d}m"

def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculates great-circle distance between two coordinate pairs in meters.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    try:
        R = 6371000.0  # Earth radius in meters
        phi1 = math.radians(float(lat1))
        phi2 = math.radians(float(lat2))
        delta_phi = math.radians(float(lat2) - float(lat1))
        delta_lambda = math.radians(float(lon2) - float(lon1))
        a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return int(round(R * c))
    except (ValueError, TypeError):
        return None


class ConflictException(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'A conflict occurred with the current attendance state.'
    default_code = 'conflict'


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict):
        if 'detail' not in response.data and len(response.data) > 0:
            first_key = list(response.data.keys())[0]
            first_val = response.data[first_key]
            if isinstance(first_val, list) and len(first_val) > 0:
                response.data['detail'] = str(first_val[0])
            else:
                response.data['detail'] = str(first_val)
    return response


class AttendanceService:
    @staticmethod
    def check_in(employee, request=None, latitude=None, longitude=None, accuracy=None, address=None):
        """
        Executes an authoritative server-side check-in using Asia/Dhaka time.
        Validates GPS, records real location address, and project geofencing boundary if configured.
        Enforces database lock to prevent duplicate check-ins.
        """
        dhaka_now = get_dhaka_datetime()
        today = dhaka_now.date()
        setting = AttendanceSetting.get_active()

        # GPS Requirement Enforcement
        if setting.require_gps and (latitude is None or longitude is None):
            raise exceptions.ValidationError(
                detail="GPS coordinates are required to check in. Please enable location services on your device."
            )

        # Geofencing calculations against employee's assigned project site or district
        distance_meters = None
        is_geofence_violation = False
        project = employee.project

        target_lat = None
        target_lon = None
        target_radius = None
        target_name = ""

        if project and project.latitude is not None and project.longitude is not None:
            target_lat = project.latitude
            target_lon = project.longitude
            target_radius = project.radius_meters
            target_name = project.name
        else:
            dist_name = employee.district or (project.district if project else None)
            if dist_name:
                from apps.accounts.bangladesh_geo import get_district_center
                d_lat, d_lon = get_district_center(dist_name)
                if d_lat and d_lon:
                    target_lat = d_lat
                    target_lon = d_lon
                    target_radius = 45000  # 45 km radius covers standard district boundary
                    target_name = f"{dist_name} District"

        if latitude is not None and longitude is not None and target_lat is not None and target_lon is not None:
            distance_meters = calculate_haversine_distance(
                latitude, longitude,
                target_lat, target_lon
            )
            # No perimeter limitation: field assistants can record attendance from anywhere without perimeter violation flags
            is_geofence_violation = False

        # Resolve human-readable address BEFORE opening the transaction. Reverse
        # geocoding is an outbound HTTP call (up to 2.5s) and must never run while
        # the select_for_update() row lock is held, or it serialises concurrent punches.
        check_in_addr = (address or "").strip()
        if not check_in_addr and latitude is not None and longitude is not None:
            check_in_addr = get_reverse_geocoded_address(latitude, longitude)

        with transaction.atomic():
            existing = (
                Attendance.objects
                .select_for_update()
                .filter(employee=employee, attendance_date=today)
                .first()
            )

            if existing:
                formatted_time = format_time_display(existing.check_in_time)
                raise ConflictException(
                    detail=f"You have already checked in today at {formatted_time}."
                )

            work_start = setting.work_start_time
            grace_minutes = setting.late_grace_minutes

            # Calculate cutoff time with grace period
            dummy_date = datetime(2000, 1, 1, work_start.hour, work_start.minute, work_start.second)
            cutoff_dt = dummy_date + timedelta(minutes=grace_minutes)
            cutoff_time = cutoff_dt.time()

            current_time = dhaka_now.time()
            attendance_status = (
                Attendance.Status.LATE
                if current_time > cutoff_time
                else Attendance.Status.PRESENT
            )

            attendance = Attendance.objects.create(
                employee=employee,
                attendance_date=today,
                check_in_time=dhaka_now,
                attendance_type=Attendance.Type.AUTOMATIC,
                status=attendance_status,
                check_in_latitude=latitude,
                check_in_longitude=longitude,
                check_in_accuracy=accuracy,
                check_in_distance_meters=distance_meters,
                check_in_is_geofence_violation=is_geofence_violation,
                check_in_address=check_in_addr
            )

            remarks_parts = [f"Checked in at {format_time_display(dhaka_now)} ({attendance_status})"]
            if check_in_addr:
                remarks_parts.append(f"Location: {check_in_addr}")
            if distance_meters is not None:
                remarks_parts.append(f"GPS: {distance_meters}m from site")

            AuditService.log(
                user=employee.user,
                action='CHECK_IN',
                object_type='Attendance',
                object_id=attendance.id,
                request=request,
                new_state={
                    'attendance_date': str(today),
                    'check_in_time': dhaka_now.isoformat(),
                    'status': attendance_status,
                    'type': Attendance.Type.AUTOMATIC,
                    'latitude': str(latitude) if latitude is not None else None,
                    'longitude': str(longitude) if longitude is not None else None,
                    'accuracy': accuracy,
                    'address': check_in_addr,
                    'distance_meters': distance_meters,
                    'geofence_violation': is_geofence_violation
                },
                remarks=" | ".join(remarks_parts)
            )

            return attendance

    @staticmethod
    def check_out(employee, request=None, latitude=None, longitude=None, accuracy=None, address=None):
        """
        Executes an authoritative server-side check-out using Asia/Dhaka time.
        Calculates working duration, records real location address, and updates record.
        """
        dhaka_now = get_dhaka_datetime()
        today = dhaka_now.date()
        setting = AttendanceSetting.get_active()

        # Geofencing calculations against employee's assigned project site or district
        distance_meters = None
        is_geofence_violation = False
        project = employee.project

        target_lat = None
        target_lon = None
        target_radius = None
        target_name = ""

        if project and project.latitude is not None and project.longitude is not None:
            target_lat = project.latitude
            target_lon = project.longitude
            target_radius = project.radius_meters
            target_name = project.name
        else:
            dist_name = employee.district or (project.district if project else None)
            if dist_name:
                from apps.accounts.bangladesh_geo import get_district_center
                d_lat, d_lon = get_district_center(dist_name)
                if d_lat and d_lon:
                    target_lat = d_lat
                    target_lon = d_lon
                    target_radius = 45000  # 45 km radius covers standard district boundary
                    target_name = f"{dist_name} District"

        if latitude is not None and longitude is not None and target_lat is not None and target_lon is not None:
            distance_meters = calculate_haversine_distance(
                latitude, longitude,
                target_lat, target_lon
            )
            # No perimeter limitation: field assistants can record attendance from anywhere without perimeter violation flags
            is_geofence_violation = False

        # Resolve human-readable address BEFORE opening the transaction. Reverse
        # geocoding is an outbound HTTP call (up to 2.5s) and must never run while
        # the select_for_update() row lock is held, or it serialises concurrent punches.
        check_out_addr = (address or "").strip()
        if not check_out_addr and latitude is not None and longitude is not None:
            check_out_addr = get_reverse_geocoded_address(latitude, longitude)

        with transaction.atomic():
            attendance = (
                Attendance.objects
                .select_for_update()
                .filter(employee=employee, attendance_date=today)
                .first()
            )

            if not attendance:
                raise exceptions.NotFound(
                    detail="No active attendance record found for today."
                )

            if attendance.check_out_time is not None:
                formatted_time = format_time_display(attendance.check_out_time)
                raise ConflictException(
                    detail=f"You have already checked out today at {formatted_time}."
                )

            # Calculate working duration in minutes
            duration_seconds = max(0, (dhaka_now - attendance.check_in_time).total_seconds())
            duration_minutes = int(round(duration_seconds / 60))

            attendance.check_out_time = dhaka_now
            attendance.working_duration_minutes = duration_minutes
            attendance.check_out_latitude = latitude
            attendance.check_out_longitude = longitude
            attendance.check_out_accuracy = accuracy
            attendance.check_out_distance_meters = distance_meters
            attendance.check_out_is_geofence_violation = is_geofence_violation
            attendance.check_out_address = check_out_addr

            attendance.save(update_fields=[
                'check_out_time', 'working_duration_minutes',
                'check_out_latitude', 'check_out_longitude', 'check_out_accuracy',
                'check_out_distance_meters', 'check_out_is_geofence_violation',
                'check_out_address',
                'updated_at'
            ])

            out_remarks = [f"Checked out at {format_time_display(dhaka_now)}. Duration: {format_duration_display(duration_minutes)}"]
            if check_out_addr:
                out_remarks.append(f"Location: {check_out_addr}")

            AuditService.log(
                user=employee.user,
                action='CHECK_OUT',
                object_type='Attendance',
                object_id=attendance.id,
                request=request,
                previous_state={'check_out_time': None, 'duration': None},
                new_state={
                    'check_out_time': dhaka_now.isoformat(),
                    'working_duration_minutes': duration_minutes,
                    'latitude': str(latitude) if latitude is not None else None,
                    'longitude': str(longitude) if longitude is not None else None,
                    'accuracy': accuracy,
                    'address': check_out_addr,
                    'distance_meters': distance_meters,
                    'geofence_violation': is_geofence_violation
                },
                remarks=" | ".join(out_remarks)
            )

            return attendance

    @staticmethod
    def get_missed_checkout(employee, today=None):
        """
        Detects duty days that were checked in but never checked out.

        The cutoff is implicit and server-derived: a record whose duty date is
        strictly before the current Asia/Dhaka date has necessarily passed
        23:59:59 of its own duty day, so it can no longer be closed by the
        assistant and needs a ManualAttendanceRequest instead. The device clock
        is never consulted.

        Only days the employee actually owes attendance for are considered,
        resolved from their per-employee schedule (ScheduleService), which falls
        back to the company-wide working week. An assistant is never nagged to
        file manual attendance for a weekly off, public holiday or leave day they
        were not required to work.

        Returns None when there is nothing outstanding.
        """
        if today is None:
            today = get_dhaka_date()

        setting = AttendanceSetting.get_active()
        # A record is only outstanding if the employee owed duty that day, so
        # the candidate dates come from the employee's own schedule rather than
        # the company working week. Resolved in one pass to avoid an N+1.
        window_start = today - timedelta(days=90)
        working = [
            date.fromisoformat(s['date'])
            for s in ScheduleService.resolve_range(
                employee, window_start, today - timedelta(days=1), setting=setting
            )
            if s['is_working']
        ]
        if not working:
            return None

        outstanding = list(
            Attendance.objects
            .filter(
                employee=employee,
                check_in_time__isnull=False,
                check_out_time__isnull=True,
                attendance_date__in=working
            )
            .order_by('-attendance_date')
        )

        if not outstanding:
            return None

        latest = outstanding[0]
        return {
            'count': len(outstanding),
            'attendance_date': str(latest.attendance_date),
            'check_in_time': latest.check_in_time.isoformat(),
            'check_in_display': format_time_display(latest.check_in_time),
            'attendance_id': latest.id,
        }

    @staticmethod
    def _serialize_calendar_attendance(rec, schedule=None, setting=None):
        """
        Per-day attendance payload for the monthly calendar, including the
        register's seconds-precision times and the derived IN/OUT status
        columns. schedule is the resolved day schedule for that date.
        """
        in_status = None
        out_offset = None
        if schedule is not None:
            in_status = ScheduleService.get_in_status(rec.check_in_time, schedule, setting=setting)
            out_offset = ScheduleService.get_out_offset_minutes(rec.check_out_time, schedule)

        return {
            'id': rec.id,
            'attendance_date': str(rec.attendance_date),
            'status': rec.status,
            'attendance_type': rec.attendance_type,
            'check_in_time': rec.check_in_time.isoformat(),
            'check_in_display': format_time_display(rec.check_in_time, with_seconds=True),
            'check_out_time': rec.check_out_time.isoformat() if rec.check_out_time else None,
            'check_out_display': (
                format_time_display(rec.check_out_time, with_seconds=True) if rec.check_out_time else None
            ),
            'working_duration_minutes': rec.working_duration_minutes,
            'working_duration_display': format_duration_short(rec.working_duration_minutes),
            'in_status': in_status,
            'out_offset_minutes': out_offset,
            'check_in_address': rec.check_in_address,
            'check_in_latitude': float(rec.check_in_latitude) if rec.check_in_latitude is not None else None,
            'check_in_longitude': float(rec.check_in_longitude) if rec.check_in_longitude is not None else None,
            'admin_remarks': rec.admin_remarks,
        }

    @staticmethod
    def get_monthly_calendar(employee, year, month):
        """
        Builds the register-style monthly attendance sheet for one employee.

        Every calendar day in the month is returned - including weekly offs,
        public holidays, approved leave and future days - because the register
        shows the whole month, not only the days that needed attendance. A day
        the employee did not owe duty for is never offered a manual request.

        Each day carries the resolved 'schedule' (G / WH / X / PH / LV) and,
        when a record exists, the seconds-precision check-in/out times, a
        register-format duration, and the derived IN / OUT status columns.

        Each day reports an 'issue' of MISSED_CHECK_IN or MISSED_CHECK_OUT so
        the assistant can be offered the correct manual request for that day.

        Days are returned newest-first, which is the order a history view reads
        in, and is part of the response contract rather than incidental.
        """
        # Imported locally: requests.services imports this module, so a
        # module-level import of requests.models risks an import cycle.
        from apps.requests.models import ManualAttendanceRequest

        setting = AttendanceSetting.get_active()
        today = get_dhaka_date()

        first = date(year, month, 1)
        last = date(year, month, calendar.monthrange(year, month)[1])

        records = {
            rec.attendance_date: rec
            for rec in Attendance.objects.filter(
                employee=employee, attendance_date__range=(first, last)
            )
        }
        pending_requests = {
            p.attendance_date: p
            for p in ManualAttendanceRequest.objects.filter(
                employee=employee,
                attendance_date__range=(first, last),
                status=ManualAttendanceRequest.Status.PENDING
            )
        }

        # One pass over the month resolves every day's schedule in three
        # queries total rather than three per day.
        schedules = ScheduleService.resolve_range(
            employee, first, last, setting=setting
        )

        days = []
        counts = {
            'working_days': 0,
            'recorded_days': 0,
            'complete_days': 0,
            'missed_check_in': 0,
            'missed_check_out': 0,
            'weekly_off_days': 0,
            'holiday_days': 0,
            'leave_days': 0,
        }
        total_minutes = 0

        for schedule in schedules:
            day = date.fromisoformat(schedule['date'])
            is_working = schedule['is_working']
            if is_working:
                counts['working_days'] += 1
            elif schedule['code'] == 'X':
                counts['weekly_off_days'] += 1
            elif schedule['code'] == 'PH':
                counts['holiday_days'] += 1
            elif schedule['code'] == 'LV':
                counts['leave_days'] += 1

            rec = records.get(day)
            pending = pending_requests.get(day)

            is_future = day > today
            is_today = day == today
            day_has_ended = day < today

            # A manual request is only ever offered for a day the employee
            # actually owed duty for.
            issue = None
            if is_working and day_has_ended:
                if rec is None:
                    issue = 'MISSED_CHECK_IN'
                elif rec.check_out_time is None:
                    issue = 'MISSED_CHECK_OUT'

            if rec is not None:
                counts['recorded_days'] += 1
                if rec.check_out_time is not None:
                    counts['complete_days'] += 1
                if rec.working_duration_minutes:
                    total_minutes += rec.working_duration_minutes

            if issue == 'MISSED_CHECK_IN':
                counts['missed_check_in'] += 1
            elif issue == 'MISSED_CHECK_OUT':
                counts['missed_check_out'] += 1

            # The register's Remarks column: an explicit reason beats a raw
            # admin note, which in turn beats a blank cell.
            remarks = ''
            if schedule['code'] == 'PH':
                remarks = f"Public Holiday: {schedule['name']}" if schedule.get('name') else 'Public Holiday'
            elif schedule['code'] == 'LV':
                remarks = f"{schedule['name']} Leave" if schedule.get('name') else 'Approved Leave'
            elif is_future:
                remarks = 'Upcoming'
            elif rec is not None and rec.admin_remarks:
                remarks = rec.admin_remarks
            elif rec is not None and rec.attendance_type == Attendance.Type.MANUAL:
                remarks = 'Manual (Approved)'

            days.append({
                'date': str(day),
                'day': day.day,
                'weekday': day.strftime('%A'),
                'weekday_short': day.strftime('%a'),
                'is_today': is_today,
                'is_future': is_future,
                'day_has_ended': day_has_ended,
                'schedule': {
                    'code': schedule['code'],
                    'label': schedule['label'],
                    'short_label': schedule['short_label'],
                    'name': schedule.get('name'),
                    'is_working': is_working,
                    'start_time': schedule['start_time'],
                    'end_time': schedule['end_time'],
                    'source': schedule['source'],
                },
                'attendance': (
                    AttendanceService._serialize_calendar_attendance(
                        rec, schedule=schedule, setting=setting
                    ) if rec else None
                ),
                'remarks': remarks,
                'issue': issue,
                # A pending request already covers this day, so do not offer a
                # second one - the service would reject it as a duplicate anyway.
                'pending_request_id': pending.id if pending else None,
                'pending_request_type': pending.request_type if pending else None,
                'can_request_check_in': issue == 'MISSED_CHECK_IN' and pending is None,
                'can_request_check_out': issue == 'MISSED_CHECK_OUT' and pending is None,
            })

        return {
            'month': month,
            'year': year,
            'server_date': str(today),
            'work_days': setting.work_days,
            'working_days_display': [
                f"{num}:{name}" for num, name in ISO_WEEKDAYS.items()
                if num in setting.working_weekdays
            ],
            'schedule': ScheduleService.get_weekly_rows(employee),
            'summary': {
                **counts,
                'total_working_minutes': total_minutes,
                'total_working_display': format_duration_display(total_minutes) if total_minutes else '--',
            },
            # Newest first: a history view reads top-down from the present.
            'days': list(reversed(days)),
        }

    @staticmethod
    def get_today_summary(employee):
        """
        Retrieves today's status, check-in/out timestamps, live duration, and server time.
        """
        dhaka_now = get_dhaka_datetime()
        today = dhaka_now.date()

        attendance = Attendance.objects.filter(employee=employee, attendance_date=today).first()
        live_duration_minutes = None

        if attendance:
            if attendance.check_out_time:
                live_duration_minutes = attendance.working_duration_minutes
            else:
                elapsed = max(0, (dhaka_now - attendance.check_in_time).total_seconds())
                live_duration_minutes = int(elapsed // 60)

        return {
            'server_datetime': dhaka_now.isoformat(),
            'server_date': str(today),
            'server_time_display': format_time_display(dhaka_now),
            'attendance': attendance,
            'is_checked_in': attendance is not None,
            'is_checked_out': attendance is not None and attendance.check_out_time is not None,
            'live_duration_minutes': live_duration_minutes,
            'live_duration_display': format_duration_display(live_duration_minutes) if live_duration_minutes is not None else "--",
            'missed_checkout': AttendanceService.get_missed_checkout(employee, today),
        }

    @staticmethod
    def reset_today_attendance(employee=None, request=None, admin_user=None, target_date=None):
        """
        Resets attendance record(s) for a given date (defaults to today in Asia/Dhaka).
        Can reset for a specific employee or all employees.
        Generates immutable audit logs for each record reset.
        """
        if target_date is None:
            target_date = get_dhaka_date()

        with transaction.atomic():
            qs = Attendance.objects.filter(attendance_date=target_date)
            if employee is not None:
                qs = qs.filter(employee=employee)

            records = list(qs.select_for_update())
            count = len(records)
            user = admin_user or (request.user if request else None)

            for att in records:
                prev_state = {
                    'attendance_id': att.id,
                    'employee_id': att.employee.employee_id,
                    'attendance_date': str(att.attendance_date),
                    'check_in_time': att.check_in_time.isoformat() if att.check_in_time else None,
                    'check_out_time': att.check_out_time.isoformat() if att.check_out_time else None,
                    'status': att.status,
                    'duration_minutes': att.working_duration_minutes,
                }
                AuditService.log(
                    user=user,
                    action='ATTENDANCE_UPDATED',
                    object_type='Attendance',
                    object_id=str(att.id),
                    request=request,
                    previous_state=prev_state,
                    new_state=None,
                    remarks=f"Duty reset for employee {att.employee.employee_id} ({att.employee.user.username}) on {target_date} by {user.username if user else 'System'}."
                )
                att.delete()

            return count

