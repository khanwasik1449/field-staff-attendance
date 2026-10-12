from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrator'
        FIELD_ASSISTANT = 'FIELD_ASSISTANT', 'Field Assistant'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.FIELD_ASSISTANT,
        db_index=True
    )

    def is_admin_user(self):
        return self.role == self.Role.ADMIN or self.is_superuser or self.is_staff

    def is_field_assistant_user(self):
        return self.role == self.Role.FIELD_ASSISTANT


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class EmployeeType(models.Model):
    """Admin-managed employee classification catalog (e.g. Field Staff, Intern).

    Employees reference a type by its ``code`` string, so legacy records keep
    working while admins can add/edit/deactivate types through the API. A type
    still referenced by employees cannot be hard-deleted.
    """
    code = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        help_text="Stable machine code stored on Employee (e.g. FIELD_STAFF)"
    )
    name = models.CharField(max_length=100, help_text="Human-readable label, e.g. Field Staff")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Employee(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='employee_profile'
    )
    employee_id = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        help_text="Unique organizational identifier e.g. FA-001"
    )
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True, default='')
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees'
    )
    employee_type = models.CharField(
        max_length=30,
        default='FIELD_STAFF',
        db_index=True,
        help_text="Staff classification code from the admin-managed EmployeeType catalog"
    )
    designation = models.CharField(max_length=100, default='Field Assistant')
    joining_date = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True, db_index=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id']
        indexes = [
            models.Index(fields=['is_active', 'employee_id']),
        ]

    def __str__(self):
        return f"{self.employee_id} - {self.full_name}"

    def get_employee_type_display(self):
        """Resolve the human-readable type label from the admin catalog."""
        if not self.employee_type:
            return ''
        type_obj = EmployeeType.objects.filter(code=self.employee_type).only('name').first()
        return type_obj.name if type_obj else self.employee_type

    def deactivate(self):
        """Soft deactivation preserving historical attendance records."""
        self.is_active = False
        self.deactivated_at = timezone.now()
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.save(update_fields=['is_active', 'deactivated_at'])

    def activate(self):
        """Reactivate employee and corresponding user account."""
        self.is_active = True
        self.deactivated_at = None
        self.user.is_active = True
        self.user.save(update_fields=['is_active'])
        self.save(update_fields=['is_active', 'deactivated_at'])
