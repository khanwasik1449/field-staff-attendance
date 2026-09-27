from rest_framework import serializers
from .models import (
    Attendance, AttendanceSetting, EmployeeSchedule, ISO_WEEKDAYS, parse_work_days
)
from .services import format_time_display, format_duration_display

class AttendanceSettingSerializer(serializers.ModelSerializer):
    work_days_display = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSetting
        fields = [
            'id', 'work_start_time', 'work_end_time',
            'work_days', 'work_days_display',
            'late_grace_minutes', 'half_day_minimum_minutes',
            'full_day_minimum_minutes', 'timezone',
            'require_gps', 'enforce_geofence',
            'is_active', 'updated_at'
        ]
        read_only_fields = ['id', 'updated_at']

    def get_work_days_display(self, obj):
        days = obj.working_weekdays
        return [
            {'number': num, 'name': name, 'enabled': num in days}
            for num, name in ISO_WEEKDAYS.items()
        ]

    def validate_work_days(self, value):
        # Raises ValidationError for malformed input before it reaches the DB.
        parse_work_days(value)
        return value


class CheckInRequestSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    accuracy = serializers.FloatField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CheckOutRequestSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    accuracy = serializers.FloatField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class AttendanceSerializer(serializers.ModelSerializer):
    employee_id = serializers.CharField(source='employee.employee_id', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')
    project_name = serializers.CharField(source='employee.project.name', read_only=True, default='')
    employee_division = serializers.CharField(source='employee.division', read_only=True, default='')
    employee_district = serializers.CharField(source='employee.district', read_only=True, default='')
    employee_upazila = serializers.CharField(source='employee.upazila', read_only=True, default='')
    check_in_display = serializers.SerializerMethodField()
    check_out_display = serializers.SerializerMethodField()
    working_duration_display = serializers.SerializerMethodField()
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True, default='')

    class Meta:
        model = Attendance
        fields = [
            'id', 'employee', 'employee_id', 'employee_name', 'department_name', 'project_name',
            'employee_division', 'employee_district', 'employee_upazila',
            'attendance_date', 'check_in_time', 'check_out_time',
            'check_in_display', 'check_out_display',
            'working_duration_minutes', 'working_duration_display',
            'attendance_type', 'status',
            'check_in_latitude', 'check_in_longitude', 'check_in_accuracy',
            'check_in_distance_meters', 'check_in_is_geofence_violation',
            'check_in_address',
            'check_out_latitude', 'check_out_longitude', 'check_out_accuracy',
            'check_out_distance_meters', 'check_out_is_geofence_violation',
            'check_out_address',
            'approved_by', 'approved_by_username', 'approved_at', 'admin_remarks',
            'manual_request', 'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_check_in_display(self, obj):
        return format_time_display(obj.check_in_time)

    def get_check_out_display(self, obj):
        return format_time_display(obj.check_out_time)

    def get_working_duration_display(self, obj):
        return format_duration_display(obj.working_duration_minutes)


class EmployeeScheduleSerializer(serializers.Serializer):
    """
    Write payload for one weekday of an employee's standing duty pattern.
    Validated here so malformed times or unknown day types are rejected before
    they reach the service layer.
    """
    weekday = serializers.IntegerField(min_value=1, max_value=7)
    day_type = serializers.ChoiceField(choices=EmployeeSchedule.DayType.choices)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        start, end = attrs.get('start_time'), attrs.get('end_time')
        if start and end and start > end:
            raise serializers.ValidationError({
                'end_time': 'End time must not be earlier than start time.'
            })
        return attrs


class EmployeeScheduleBulkSerializer(serializers.Serializer):
    """Write payload for replacing an employee's whole weekly pattern."""
    employee_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    days = EmployeeScheduleSerializer(many=True)

    def validate_days(self, value):
        seen = [row['weekday'] for row in value]
        if len(seen) != len(set(seen)):
            raise serializers.ValidationError('Each weekday may appear only once.')
        return value
