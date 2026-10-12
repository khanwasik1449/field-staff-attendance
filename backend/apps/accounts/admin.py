from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Department, Employee, EmployeeType

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('FAMS Role', {'fields': ('role',)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('FAMS Role', {'fields': ('role',)}),
    )

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'created_at')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)


@admin.register(EmployeeType)
class EmployeeTypeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_active', 'created_at')
    search_fields = ('code', 'name')
    list_filter = ('is_active',)

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'full_name', 'phone', 'employee_type', 'department', 'is_active')
    search_fields = ('employee_id', 'full_name', 'phone', 'user__username')
    list_filter = ('is_active', 'employee_type', 'department')
    actions = ['activate_employees', 'deactivate_employees']

    @admin.action(description="Reactivate selected employees")
    def activate_employees(self, request, queryset):
        for emp in queryset:
            emp.activate()

    @admin.action(description="Soft-deactivate selected employees")
    def deactivate_employees(self, request, queryset):
        for emp in queryset:
            emp.deactivate()
