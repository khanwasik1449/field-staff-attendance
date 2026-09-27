from rest_framework import generics, status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.http import HttpResponse

from .models import User, Department, Project, Employee
from .serializers import (
    UserMinimalSerializer,
    DepartmentSerializer,
    ProjectSerializer,
    EmployeeSerializer,
    EmployeeCreateSerializer,
    LoginSerializer
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


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        employee_data = None
        if hasattr(user, 'employee_profile'):
            employee_data = EmployeeSerializer(user.employee_profile).data

        setting = AttendanceSetting.get_active()

        return Response({
            'user': UserMinimalSerializer(user).data,
            'employee': employee_data,
            'settings': {
                'work_start_time': str(setting.work_start_time),
                'work_end_time': str(setting.work_end_time),
                'late_grace_minutes': setting.late_grace_minutes,
                'timezone': setting.timezone,
                'require_gps': setting.require_gps,
                'enforce_geofence': setting.enforce_geofence,
            }
        })


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all().order_by('name')
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdmin]


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all().order_by('name')
    serializer_class = ProjectSerializer
    permission_classes = [IsAdmin]


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('user', 'department', 'project').all().order_by('employee_id')
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
        employee = self.get_object()
        new_password = request.data.get('new_password')
        if not new_password or len(str(new_password).strip()) < 6:
            return Response(
                {'detail': 'Password must be at least 6 characters long.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = employee.user
        user.set_password(str(new_password).strip())
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
        employee_id = request.data.get('employee_id')
        new_password = request.data.get('new_password')
        if not employee_id:
            return Response({'detail': 'Employee ID or selection is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not new_password or len(str(new_password).strip()) < 6:
            return Response({'detail': 'Password must be at least 6 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

        employee = (
            Employee.objects
            .filter(Q(id__iexact=str(employee_id)) | Q(employee_id__iexact=str(employee_id)) | Q(user__username__iexact=str(employee_id)))
            .select_related('user')
            .first()
        )
        if not employee:
            return Response({'detail': f'Employee "{employee_id}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = employee.user
        user.set_password(str(new_password).strip())
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
        Download Excel (.xlsx) or CSV template pre-filled with real active projects
        and guidance for bulk uploading project-based Field Assistants.
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
        Bulk upload project-based Field Assistants from an Excel (.xlsx) or CSV file.
        Assigns projects, auto-resolves district geodata, and provisions user accounts.
        """
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {'detail': 'Please select an Excel (.xlsx) or CSV (.csv) file to upload.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        default_project_id = request.data.get('default_project_id')
        if default_project_id in ('', 'null', 'undefined', None):
            default_project_id = None

        result = EmployeeBulkUploadService.process_bulk_upload(
            file_obj=uploaded_file,
            filename=uploaded_file.name,
            default_project_id=default_project_id,
            request=request,
            admin_user=request.user
        )

        status_code = status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)



class BangladeshGeoView(APIView):
    """
    Returns the complete administrative hierarchy of Bangladesh:
    8 Divisions, 64 Districts (Zillas), their respective Upazilas/Thanas,
    and authoritative center GPS coordinates.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from .bangladesh_geo import BANGLADESH_GEO
        return Response({
            'divisions': list(BANGLADESH_GEO.keys()),
            'geo': BANGLADESH_GEO
        })
