from rest_framework import serializers
from .models import ManualAttendanceRequest
from apps.attendance.services import format_time_display

class ManualAttendanceRequestSerializer(serializers.ModelSerializer):
    employee_id = serializers.CharField(source='employee.employee_id', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default='')
    requested_check_in_display = serializers.SerializerMethodField()
    requested_check_out_display = serializers.SerializerMethodField()
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)

    class Meta:
        model = ManualAttendanceRequest
        fields = [
            'id', 'employee', 'employee_id', 'employee_name', 'department_name',
            'attendance_date', 'request_type', 'request_type_display',
            'requested_check_in', 'requested_check_out',
            'requested_check_in_display', 'requested_check_out_display',
            'reason', 'remarks', 'status',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'admin_remarks',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'employee', 'status', 'reviewed_by',
            'reviewed_at', 'admin_remarks', 'created_at', 'updated_at'
        ]

    def get_requested_check_in_display(self, obj):
        # Null for MISSED_CHECK_OUT: the existing server-recorded check-in is kept,
        # so be explicit rather than rendering a misleading blank.
        if obj.requested_check_in is None:
            return 'Kept from existing record'
        return format_time_display(obj.requested_check_in)

    def get_requested_check_out_display(self, obj):
        return format_time_display(obj.requested_check_out)


class ManualAttendanceRequestCreateSerializer(serializers.Serializer):
    attendance_date = serializers.DateField()
    request_type = serializers.ChoiceField(
        choices=ManualAttendanceRequest.RequestType.choices,
        default=ManualAttendanceRequest.RequestType.MISSED_CHECK_IN,
    )
    requested_check_in = serializers.DateTimeField(required=False, allow_null=True, default=None)
    requested_check_out = serializers.DateTimeField()
    reason = serializers.CharField(max_length=1000)
    remarks = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    def validate(self, attrs):
        request_type = attrs['request_type']
        check_in = attrs.get('requested_check_in')
        check_out = attrs['requested_check_out']

        if request_type == ManualAttendanceRequest.RequestType.MISSED_CHECK_IN:
            if check_in is None:
                raise serializers.ValidationError(
                    {"requested_check_in": "A check-in time is required for a missed check-in request."}
                )
            if check_out <= check_in:
                raise serializers.ValidationError(
                    {"requested_check_out": "Requested check-out time must be after check-in time."}
                )
        else:  # MISSED_CHECK_OUT
            if check_in is not None:
                raise serializers.ValidationError(
                    {"requested_check_in": "A 'Missed Check-Out' request must not supply a check-in time; the existing check-in is preserved."}
                )
        return attrs


class ReviewActionSerializer(serializers.Serializer):
    admin_remarks = serializers.CharField(required=False, allow_blank=True, default='')
