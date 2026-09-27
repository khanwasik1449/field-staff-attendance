import zoneinfo
import math
import urllib.request
import urllib.parse
import json
from datetime import datetime, time, timedelta
from django.utils import timezone
from django.db import transaction
from rest_framework import exceptions, status
from rest_framework.views import exception_handler
from rest_framework.response import Response

from .models import Attendance, AttendanceSetting
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

def format_time_display(dt):
    if not dt:
        return ""
    tz = get_server_timezone()
    local_dt = dt.astimezone(tz) if dt.tzinfo else dt
    return local_dt.strftime("%I:%M %p")

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

