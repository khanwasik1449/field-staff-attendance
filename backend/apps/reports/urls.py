from django.urls import path
from .views import (
    DashboardSummaryView,
    DailyReportView,
    DailyReportExportView,
    MonthlyReportView,
    MonthlyReportExportView,
    EmployeeReportView,
    EmployeeReportExportView,
)

urlpatterns = [
    path('dashboard-summary/', DashboardSummaryView.as_view(), name='dashboard_summary'),
    path('daily/', DailyReportView.as_view(), name='daily_report'),
    path('daily/export/', DailyReportExportView.as_view(), name='daily_report_export'),
    path('monthly/', MonthlyReportView.as_view(), name='monthly_report'),
    path('monthly/export/', MonthlyReportExportView.as_view(), name='monthly_report_export'),
    path('employee/<str:employee_id>/', EmployeeReportView.as_view(), name='employee_report'),
    path('employee/<str:employee_id>/export/', EmployeeReportExportView.as_view(), name='employee_report_export'),
]
