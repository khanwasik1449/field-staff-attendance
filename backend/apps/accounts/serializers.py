from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User, Department, Employee, EmployeeType
from django.db import transaction
import re

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'is_active', 'created_at']


class EmployeeTypeSerializer(serializers.ModelSerializer):
    employee_count = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = EmployeeType
        fields = ['id', 'code', 'name', 'is_active', 'employee_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'employee_count', 'created_at', 'updated_at']

    def get_employee_count(self, obj):
        value = getattr(obj, 'employee_count', None)
        if value is None:
            value = Employee.objects.filter(employee_type=obj.code).count()
        return value

    def validate_code(self, value):
        code = (value or '').strip().upper()
        if not code:
            raise serializers.ValidationError("Code is required.")
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', code):
            raise serializers.ValidationError(
                "Code must be a single uppercase token (letters, digits, underscores)."
            )
        return code




def serialize_attendance_settings(setting):
    """Server-authoritative attendance settings shared by /auth/login/ and /auth/me/.

    Returning these with the login response lets the client hydrate the punch
    screen without a second round-trip, which trims perceived login time.
    """
    return {
        'work_start_time': str(setting.work_start_time),
        'work_end_time': str(setting.work_end_time),
        'late_grace_minutes': setting.late_grace_minutes,
        'timezone': setting.timezone,
        'require_gps': setting.require_gps,
    }

class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'is_active']


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    employee_type_display = serializers.CharField(source='get_employee_type_display', read_only=True)
    email = serializers.EmailField(source='user.email', required=False, allow_blank=True)
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'employee_id', 'full_name', 'phone',
            'employee_type', 'employee_type_display',
            'department', 'department_name',
            'designation', 'joining_date', 'is_active', 'deactivated_at',
            'email', 'username', 'role', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'deactivated_at', 'created_at', 'updated_at']

    def validate_employee_type(self, value):
        code = (value or '').strip()
        if not code:
            return value
        type_obj = EmployeeType.objects.filter(code=code).first()
        if not type_obj:
            raise serializers.ValidationError(
                f"Unknown employee type '{code}'. Pick a value from the Employee Types catalog."
            )
        if not type_obj.is_active and getattr(self.instance, 'employee_type', None) != code:
            raise serializers.ValidationError(
                f"Employee type '{type_obj.name}' is inactive. Reactivate it or pick another type."
            )
        return code

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', None)
        employee = super().update(instance, validated_data)
        if user_data and 'email' in user_data:
            employee.user.email = user_data.get('email') or ''
            employee.user.save(update_fields=['email'])
        return employee


from django.utils import timezone

class EmployeeCreateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, min_length=6)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.FIELD_ASSISTANT, write_only=True)
    employee_type = serializers.CharField(required=False, default=lambda: EmployeeType.objects.filter(is_active=True).values_list('code', flat=True).first() or 'FIELD_STAFF')
    employee_type_display = serializers.CharField(source='get_employee_type_display', read_only=True)
    joining_date = serializers.DateField(required=False, default=timezone.localdate)

    class Meta:
        model = Employee
        fields = [
            'id', 'employee_id', 'full_name', 'phone',
            'employee_type', 'employee_type_display',
            'department', 'designation', 'joining_date',
            'username', 'password', 'email', 'role'
        ]

    def validate_employee_type(self, value):
        code = (value or '').strip()
        if not code:
            return code
        type_obj = EmployeeType.objects.filter(code=code).first()
        if not type_obj:
            raise serializers.ValidationError(
                f"Unknown employee type '{code}'. Pick a value from the Employee Types catalog."
            )
        if not type_obj.is_active:
            raise serializers.ValidationError(
                f"Employee type '{type_obj.name}' is inactive and cannot be assigned to new employees."
            )
        return code

    def validate_password(self, value):
        from .password_policy import PasswordPolicyContext, validate_secure_password
        username = self.initial_data.get('username', '')
        email = self.initial_data.get('email', '')
        full_name = str(self.initial_data.get('full_name', '')).strip()
        context = PasswordPolicyContext(username=username, email=email, full_name=full_name)
        validate_secure_password(value, user=context, full_name=full_name)
        return value

    def create(self, validated_data):
        username = validated_data.pop('username')
        password = validated_data.pop('password')
        email = validated_data.pop('email', '')
        role = validated_data.pop('role', User.Role.FIELD_ASSISTANT)

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                role=role
            )
            employee = Employee.objects.create(user=user, **validated_data)
        return employee


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError({"detail": "Invalid username or password."})

        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account is inactive. Please contact an administrator."})

        # Field Assistants must sign in through the Employee ID + password flow.
        if user.is_field_assistant_user():
            raise serializers.ValidationError(
                {"detail": "Field Assistants must sign in with Employee ID and password."}
            )

        refresh = RefreshToken.for_user(user)
        # Add custom claims
        refresh['role'] = user.role
        refresh['username'] = user.username

        employee_data = None
        if hasattr(user, 'employee_profile'):
            employee_data = EmployeeSerializer(user.employee_profile).data

        from apps.attendance.models import AttendanceSetting
        setting = AttendanceSetting.get_active()

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserMinimalSerializer(user).data,
            'employee': employee_data,
            'settings': serialize_attendance_settings(setting),
        }


class FaLoginSerializer(serializers.Serializer):
    """Field Assistant login: Employee ID + password.

    The password is verified against the stored PBKDF2 hash. Rejects any non
    field-assistant account and keeps all validation server-side.
    """

    employee_id = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        raw = str(attrs.get('employee_id', '')).strip()
        password = str(attrs.get('password', ''))
        if not raw:
            raise serializers.ValidationError({"detail": "Please enter your Employee ID."})
        if not password:
            raise serializers.ValidationError({"detail": "Please enter your password."})

        employee = (
            Employee.objects
            .filter(employee_id__iexact=raw, is_active=True, user__is_active=True)
            .select_related('user', 'department')
            .first()
        )
        if not employee or not employee.user.is_field_assistant_user():
            raise serializers.ValidationError({"detail": "Invalid Employee ID or password."})

        if not employee.user.check_password(password):
            raise serializers.ValidationError({"detail": "Invalid Employee ID or password."})

        user = employee.user
        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['username'] = user.username

        from apps.attendance.models import AttendanceSetting
        setting = AttendanceSetting.get_active()

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserMinimalSerializer(user).data,
            'employee': EmployeeSerializer(employee).data,
            'settings': serialize_attendance_settings(setting),
        }
