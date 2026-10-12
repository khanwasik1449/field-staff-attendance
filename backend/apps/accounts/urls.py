from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView, FaLoginView, CurrentUserView,
    EmployeeViewSet, DepartmentViewSet, EmployeeTypeViewSet,
)

router = DefaultRouter()
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'employee-types', EmployeeTypeViewSet, basename='employee-type')

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth_login'),
    path('fa-login/', FaLoginView.as_view(), name='auth_fa_login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', CurrentUserView.as_view(), name='auth_me'),
    path('', include(router.urls)),
]
