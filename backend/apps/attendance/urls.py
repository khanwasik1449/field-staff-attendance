from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TodayAttendanceView,
    CheckInView,
    CheckOutView,
    MyAttendanceHistoryView,
    MyAttendanceCalendarView,
    AdminAttendanceViewSet,
    AttendanceSettingView,
    AdminResetDutyView,
    EmployeeScheduleViewSet
)

router = DefaultRouter()
router.register(r'admin/all', AdminAttendanceViewSet, basename='admin_attendance')
router.register(
    r'admin/employee-schedule',
    EmployeeScheduleViewSet,
    basename='admin_employee_schedule'
)

urlpatterns = [
    # Field Assistant routes
    path('today/', TodayAttendanceView.as_view(), name='attendance_today'),
    path('check-in/', CheckInView.as_view(), name='attendance_check_in'),
    path('check-out/', CheckOutView.as_view(), name='attendance_check_out'),
    path('my-history/', MyAttendanceHistoryView.as_view(), name='attendance_my_history'),
    path('my-calendar/', MyAttendanceCalendarView.as_view(), name='attendance_my_calendar'),
    
    # Admin routes
    path('admin/reset-duty/', AdminResetDutyView.as_view(), name='admin_reset_duty'),
    path('settings/', AttendanceSettingView.as_view(), name='attendance_settings'),
    path('', include(router.urls)),
]
