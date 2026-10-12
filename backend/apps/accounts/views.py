from rest_framework import generics, status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, F, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.http import HttpResponse

from .models import User, Department, Employee, EmployeeType
from .serializers import (
    UserMinimalSerializer,
    DepartmentSerializer,
    EmployeeTypeSerializer,
    EmployeeSerializer,
    EmployeeCreateSerializer,
    LoginSerializer,
    FaLoginSerializer
)
from .permissions import IsAdmin
from .services import EmployeeBulkUploadService
from apps.audit.services import AuditService
from apps.attendance.models import AttendanceSetting

class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user_obj = User.objects.get(username=request.data.get('username'))
        AuditService.log(
            user=user_obj,
            action='USER_LOGIN',
            object_type='User',
            object_id=user_obj.id,
            request=request,
            remarks=f"User {user_obj.username} logged in successfully."
        )

        return Response(data, status=status.HTTP_200_OK)


class FaLoginView(APIView):
    """Field Assistant login requiring Employee ID + password.

    The password is verified server-side against its stored PBKDF2 hash.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = FaLoginSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            raw = str(request.data.get('employee_id', '')).strip()
            employee = (
                Employee.objects
                .filter(employee_id__iexact=raw)
                .select_related('user')
                .first()
            )
            AuditService.log(
                user=employee.user if employee else None,
                action='FA_LOGIN_FAILED',
                object_type='Employee',
                object_id=employee.id if employee else '',
                request=request,
                remarks=f"Failed Field Assistant login attempt for '{raw}'."
            )
            raise

        data = serializer.validated_data
        user_obj = User.objects.get(id=data['user']['id'])
        AuditService.log(
            user=user_obj,
            action='FA_LOGIN',
            object_type='User',
            object_id=user_obj.id,
            request=request,
            remarks=f"Field Assistant {user_obj.username} logged in with Employee ID and password."
        )
        return Response(data, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        employee_data = None
        if hasattr(user, 'employee_profile'):
            employee_data = EmployeeSerializer(user.employee_profile).data

        setting = AttendanceSetting.get_active()

        from .serializers import serialize_attendance_settings
        return Response({
            'user': UserMinimalSerializer(user).data,
            'employee': employee_data,
            'settings': serialize_attendance_settings(setting),
        })


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all().order_by('name')
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdmin]


class EmployeeTypeViewSet(viewsets.ModelViewSet):
    """Admin-only CRUD for the employee-type catalog.

    A type that is still referenced by employees cannot be hard-deleted; use
    PATCH ``is_active=false`` instead to retire it without breaking history.
    """
    queryset = EmployeeType.objects.annotate(
        employee_count=Coalesce(
            Subquery(
                Employee.objects
                .filter(employee_type=OuterRef('code'))
                .order_by()
                .values('employee_type')
                .annotate(cnt=Count('id'))
                .values('cnt')
            ),
            0,
            output_field=IntegerField(),
        )
    ).order_by('name')
    serializer_class = EmployeeTypeSerializer
    permission_classes = [IsAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        active = self.request.query_params.get('is_active')
        if active is not None:
            if active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)
        return qs

    def destroy(self, request, *args, **kwargs):
        type_obj = self.get_object()
        in_use = Employee.objects.filter(employee_type=type_obj.code).exists()
        if in_use:
            return Response(
                {
                    'detail': (
                        f"Employee type '{type_obj.name}' is assigned to employees and cannot be "
                        "deleted. Deactivate it instead so existing records stay intact."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        type_obj = serializer.save()
        AuditService.log(
            user=self.request.user,
            action='USER_CREATED',
            object_type='EmployeeType',
            object_id=type_obj.id,
            request=self.request,
            new_state={'code': type_obj.code, 'name': type_obj.name},
            remarks=f"Created employee type {type_obj.name} ({type_obj.code})"
        )

    def perform_update(self, serializer):
        old = self.get_object()
        old_state = {'code': old.code, 'name': old.name, 'is_active': old.is_active}
        type_obj = serializer.save()
        new_state = {'code': type_obj.code, 'name': type_obj.name, 'is_active': type_obj.is_active}
        AuditService.log(
            user=self.request.user,
            action='USER_UPDATED',
            object_type='EmployeeType',
            object_id=type_obj.id,
            request=self.request,
            previous_state=old_state,
            new_state=new_state,
            remarks=f"Updated employee type {type_obj.name} ({type_obj.code})"
        )

    def perform_destroy(self, instance):
        AuditService.log(
            user=self.request.user,
            action='USER_DISABLED',
            object_type='EmployeeType',
            object_id=instance.id,
            request=self.request,
            remarks=f"Deleted employee type {instance.name} ({instance.code})"
        )
        super().perform_destroy(instance)


















class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('user', 'department').all().order_by('employee_id')
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return EmployeeCreateSerializer
        return EmployeeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(employee_id__icontains=search) |
                Q(full_name__icontains=search) |
                Q(user__email__icontains=search) |
                Q(phone__icontains=search)
            )
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)
        department_id = self.request.query_params.get('department')
        if department_id:
            qs = qs.filter(department_id=department_id)
        employee_type = self.request.query_params.get('employee_type')
        if employee_type:
            qs = qs.filter(employee_type=employee_type)
        return qs

    def perform_create(self, serializer):
        employee = serializer.save()
        AuditService.log(
            user=self.request.user,
            action='USER_CREATED',
            object_type='Employee',
            object_id=employee.id,
            request=self.request,
            new_state={'employee_id': employee.employee_id, 'full_name': employee.full_name},
            remarks=f"Created employee profile {employee.employee_id}"
        )

    def perform_update(self, serializer):
        old_employee = self.get_object()
        old_state = {'full_name': old_employee.full_name, 'phone': old_employee.phone, 'is_active': old_employee.is_active}
        employee = serializer.save()
        new_state = {'full_name': employee.full_name, 'phone': employee.phone, 'is_active': employee.is_active}
        AuditService.log(
            user=self.request.user,
            action='USER_UPDATED',
            object_type='Employee',
            object_id=employee.id,
            request=self.request,
            previous_state=old_state,
            new_state=new_state,
            remarks=f"Updated employee {employee.employee_id}"
        )

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        employee = self.get_object()
        if not employee.is_active:
            return Response({'detail': f'Employee {employee.employee_id} is already deactivated.'}, status=status.HTTP_400_BAD_REQUEST)
        
        employee.deactivate()
        AuditService.log(
            user=request.user,
            action='USER_DISABLED',
            object_type='Employee',
            object_id=employee.id,
            request=request,
            remarks=f"Soft-deactivated employee {employee.employee_id} and user account."
        )
        return Response(EmployeeSerializer(employee).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        employee = self.get_object()
        if employee.is_active:
            return Response({'detail': f'Employee {employee.employee_id} is already active.'}, status=status.HTTP_400_BAD_REQUEST)
        
        employee.activate()
        AuditService.log(
            user=request.user,
            action='USER_ACTIVATED',
            object_type='Employee',
            object_id=employee.id,
            request=request,
            remarks=f"Reactivated employee {employee.employee_id} and user account."
        )
        return Response(EmployeeSerializer(employee).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from .password_policy import validate_secure_password

        employee = self.get_object()
        new_password = str(request.data.get('new_password') or '').strip()
        if not new_password:
            return Response(
                {'detail': 'Password is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = employee.user
        try:
            validate_secure_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save()
        AuditService.log(
            user=request.user,
            action='USER_UPDATED',
            object_type='User',
            object_id=user.id,
            request=request,
            remarks=f"Admin reset password for employee {employee.employee_id} ({user.username})"
        )
        return Response({
            'detail': f"Password for {employee.full_name} ({user.username}) successfully updated.",
            'employee_id': employee.employee_id,
            'username': user.username,
            'full_name': employee.full_name
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='quick-reset-password')
    def quick_reset_password(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from .password_policy import validate_secure_password

        employee_id = request.data.get('employee_id')
        new_password = str(request.data.get('new_password') or '').strip()
        if not employee_id:
            return Response({'detail': 'Employee ID or selection is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not new_password:
            return Response({'detail': 'Password is required.'}, status=status.HTTP_400_BAD_REQUEST)

        employee = (
            Employee.objects
            .filter(Q(id__iexact=str(employee_id)) | Q(employee_id__iexact=str(employee_id)) | Q(user__username__iexact=str(employee_id)))
            .select_related('user')
            .first()
        )
        if not employee:
            return Response({'detail': f'Employee "{employee_id}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = employee.user
        try:
            validate_secure_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save()
        AuditService.log(
            user=request.user,
            action='USER_UPDATED',
            object_type='User',
            object_id=user.id,
            request=request,
            remarks=f"Admin quick-reset password for employee {employee.employee_id} ({user.username})"
        )
        return Response({
            'detail': f"Password for {employee.full_name} ({user.username}) successfully updated.",
            'employee_id': employee.employee_id,
            'username': user.username,
            'full_name': employee.full_name
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='bulk-template')
    def bulk_template(self, request):
        """
        Download Excel (.xlsx) or CSV template for bulk uploading Field Assistants.
        """
        fmt = (
            request.query_params.get('file_type')
            or request.query_params.get('type')
            or request.query_params.get('export_format')
            or request.query_params.get('fmt')
            or 'xlsx'
        ).lower()
        if fmt == 'csv':
            content = EmployeeBulkUploadService.generate_csv_template()
            response = HttpResponse(content, content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="fams_fa_bulk_upload_template.csv"'
            return response
        else:
            content = EmployeeBulkUploadService.generate_excel_template()
            response = HttpResponse(
                content,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="fams_fa_bulk_upload_template.xlsx"'
            return response

    @action(detail=False, methods=['post'], url_path='bulk-upload', parser_classes=[MultiPartParser, FormParser, JSONParser])
    def bulk_upload(self, request):
        """
        Bulk upload Field Assistants from an Excel (.xlsx) or CSV file.
        Assigns an employee type and provisions user accounts.
        """
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {'detail': 'Please select an Excel (.xlsx) or CSV (.csv) file to upload.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = EmployeeBulkUploadService.process_bulk_upload(
            file_obj=uploaded_file,
            filename=uploaded_file.name,
            request=request,
            admin_user=request.user
        )

        status_code = status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)
