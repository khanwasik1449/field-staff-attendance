from rest_framework import status, generics, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action

from .models import ManualAttendanceRequest
from .serializers import (
    ManualAttendanceRequestSerializer,
    ManualAttendanceRequestCreateSerializer,
    ReviewActionSerializer
)
from .services import ManualRequestService
from apps.accounts.permissions import IsAdmin, IsFieldAssistant, IsActiveEmployee

class SubmitManualRequestView(APIView):
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def post(self, request):
        serializer = ManualAttendanceRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        employee = request.user.employee_profile
        manual_req = ManualRequestService.create_request(
            employee=employee,
            attendance_date=data['attendance_date'],
            request_type=data['request_type'],
            requested_check_in=data.get('requested_check_in'),
            requested_check_out=data['requested_check_out'],
            reason=data['reason'],
            remarks=data.get('remarks', ''),
            request=request
        )

        return Response({
            'detail': "Manual attendance request submitted successfully.",
            'request': ManualAttendanceRequestSerializer(manual_req).data
        }, status=status.HTTP_201_CREATED)


class MyManualRequestsView(generics.ListAPIView):
    """
    Returns manual attendance requests submitted by the authenticated Field Assistant.
    """
    serializer_class = ManualAttendanceRequestSerializer
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def get_queryset(self):
        employee = self.request.user.employee_profile
        qs = ManualAttendanceRequest.objects.filter(employee=employee).order_by('-created_at')

        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month:
            qs = qs.filter(attendance_date__month=month)
        if year:
            qs = qs.filter(attendance_date__year=year)

        return qs


class AdminManualRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Administrator viewset for reviewing, approving, and rejecting manual attendance requests.
    """
    queryset = (
        ManualAttendanceRequest.objects
        .select_related('employee', 'employee__department', 'reviewed_by')
        .all()
        .order_by('-created_at')
    )
    serializer_class = ManualAttendanceRequestSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        date_val = self.request.query_params.get('date')
        if date_val:
            qs = qs.filter(attendance_date=date_val)

        employee_id = self.request.query_params.get('employee_id')
        if employee_id:
            qs = qs.filter(employee__employee_id=employee_id)

        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        serializer = ReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin_remarks = serializer.validated_data.get('admin_remarks', '')

        manual_req = ManualRequestService.approve_request(
            req_id=pk,
            admin_user=request.user,
            admin_remarks=admin_remarks,
            request=request
        )

        return Response({
            'detail': f"Manual attendance request #{manual_req.id} approved successfully.",
            'request': ManualAttendanceRequestSerializer(manual_req).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = ReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin_remarks = serializer.validated_data.get('admin_remarks', '')

        manual_req = ManualRequestService.reject_request(
            req_id=pk,
            admin_user=request.user,
            admin_remarks=admin_remarks,
            request=request
        )

        return Response({
            'detail': f"Manual attendance request #{manual_req.id} rejected.",
            'request': ManualAttendanceRequestSerializer(manual_req).data
        }, status=status.HTTP_200_OK)
