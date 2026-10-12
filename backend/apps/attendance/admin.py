from django.contrib import admin
from .models import AttendanceSetting, Attendance

@admin.register(AttendanceSetting)
class AttendanceSettingAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'work_start_time', 'work_end_time', 'late_grace_minutes',
        'half_day_minimum_minutes', 'full_day_minimum_minutes', 'timezone',
        'require_gps', 'is_active', 'updated_at'
    )

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'employee', 'attendance_date', 'status', 'attendance_type',
        'check_in_time', 'check_out_time', 'working_duration_minutes'
    )
    list_filter = ('attendance_date', 'status', 'attendance_type')
    search_fields = ('employee__employee_id', 'employee__full_name', 'employee__user__username')
    date_hierarchy = 'attendance_date'
