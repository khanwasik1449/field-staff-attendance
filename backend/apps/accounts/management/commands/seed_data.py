from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta
from apps.accounts.models import User, Department, Employee, EmployeeType
from apps.attendance.models import AttendanceSetting, Attendance
from apps.requests.models import ManualAttendanceRequest
from apps.attendance.services import get_dhaka_datetime

class Command(BaseCommand):
    help = "Seed initial data for FAMS including admin, departments, employee types, and field assistants."

    def handle(self, *args, **options):
        self.stdout.write("Seeding FAMS initial data...")

        # 0. Employee Type catalog (admins manage this list going forward).
        for code, name in (('FIELD_STAFF', 'Field Staff'), ('INTERN', 'Intern')):
            EmployeeType.objects.get_or_create(code=code, defaults={'name': name})
        self.stdout.write("✓ Employee types initialized (Field Staff, Intern).")

        # 1. Company Settings
        setting, _ = AttendanceSetting.objects.get_or_create(
            id=1,
            defaults={
                'work_start_time': '09:00:00',
                'work_end_time': '17:00:00',
                'late_grace_minutes': 15,
                'half_day_minimum_minutes': 240,
                'full_day_minimum_minutes': 480,
                'timezone': 'Asia/Dhaka',
                'is_active': True,
            }
        )
        self.stdout.write("✓ Attendance settings initialized.")

        # 2. Departments
        dept_ops, _ = Department.objects.get_or_create(name="Field Operations", defaults={'code': 'OPS'})
        dept_res, _ = Department.objects.get_or_create(name="Survey & Research", defaults={'code': 'RES'})
        dept_log, _ = Department.objects.get_or_create(name="Logistics & Delivery", defaults={'code': 'LOG'})

        # 4. Admin User
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@fams.org',
                'role': User.Role.ADMIN,
                'is_staff': True,
                'is_superuser': True,
            }
        )
        if created:
            admin_user.set_password('admin123')
            admin_user.save()
            self.stdout.write("✓ Admin user created (admin / admin123).")

        # 5. Field Assistants
        assistants_data = [
            {
                'username': 'fa001',
                'password': 'Fams@123',
                'email': 'rahim.ahmed@fams.org',
                'employee_id': 'FA-001',
                'full_name': 'Rahim Ahmed',
                'phone': '+8801711001122',
                'department': dept_ops,
                'employee_type': 'FIELD_STAFF',
                'designation': 'Senior Field Assistant',
            },
            {
                'username': 'fa002',
                'password': 'Fams@123',
                'email': 'fatima.begum@fams.org',
                'employee_id': 'FA-002',
                'full_name': 'Fatima Begum',
                'phone': '+8801811334455',
                'department': dept_res,
                'employee_type': 'FIELD_STAFF',
                'designation': 'Field Enumerator',
            },
            {
                'username': 'fa003',
                'password': 'Fams@123',
                'email': 'tariqul.islam@fams.org',
                'employee_id': 'FA-003',
                'full_name': 'Tariqul Islam',
                'phone': '+8801911556677',
                'department': dept_log,
                'employee_type': 'FIELD_STAFF',
                'designation': 'Field Logistics Assistant',
            },
            {
                'username': 'fa004',
                'password': 'Fams@123',
                'email': 'nasreen.akter@fams.org',
                'employee_id': 'FA-004',
                'full_name': 'Nasreen Akter',
                'phone': '+8801611778899',
                'department': dept_ops,
                'employee_type': 'INTERN',
                'designation': 'Junior Field Assistant',
            }
        ]

        created_employees = []
        for d in assistants_data:
            u, u_created = User.objects.get_or_create(
                username=d['username'],
                defaults={
                    'email': d['email'],
                    'role': User.Role.FIELD_ASSISTANT,
                    'is_staff': False,
                    'is_superuser': False,
                }
            )
            if u_created:
                u.set_password(d['password'])
                u.save()

            emp, emp_created = Employee.objects.get_or_create(
                user=u,
                defaults={
                    'employee_id': d['employee_id'],
                    'full_name': d['full_name'],
                    'phone': d['phone'],
                    'department': d['department'],
                    'employee_type': d['employee_type'],
                    'designation': d['designation'],
                    'joining_date': date(2025, 1, 15),
                    'is_active': True,
                }
            )
            created_employees.append(emp)
            if emp_created:
                self.stdout.write(f"✓ Created assistant {emp.employee_id} - {emp.full_name}")

        # 6. Sample Past Attendance & Manual Request for Demonstration
        today = get_dhaka_datetime().date()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        # Historical records for FA-001
        emp1 = created_employees[0]
        # Two days ago: Present automatic
        att_two_days, _ = Attendance.objects.get_or_create(
            employee=emp1,
            attendance_date=two_days_ago,
            defaults={
                'check_in_time': timezone.now() - timedelta(days=2, hours=8),
                'check_out_time': timezone.now() - timedelta(days=2),
                'working_duration_minutes': 480,
                'attendance_type': Attendance.Type.AUTOMATIC,
                'status': Attendance.Status.PRESENT,
            }
        )

        # Yesterday: Manual Approved
        req_yesterday, _ = ManualAttendanceRequest.objects.get_or_create(
            employee=emp1,
            attendance_date=yesterday,
            defaults={
                'requested_check_in': timezone.now() - timedelta(days=1, hours=8),
                'requested_check_out': timezone.now() - timedelta(days=1),
                'reason': 'Device battery depleted during field survey.',
                'status': ManualAttendanceRequest.Status.APPROVED,
                'reviewed_by': admin_user,
                'reviewed_at': timezone.now() - timedelta(days=1, hours=1),
                'admin_remarks': 'Verified with field team supervisor.',
            }
        )
        att_yesterday, _ = Attendance.objects.get_or_create(
            employee=emp1,
            attendance_date=yesterday,
            defaults={
                'check_in_time': timezone.now() - timedelta(days=1, hours=8),
                'check_out_time': timezone.now() - timedelta(days=1),
                'working_duration_minutes': 480,
                'attendance_type': Attendance.Type.MANUAL,
                'status': Attendance.Status.PRESENT,
                'approved_by': admin_user,
                'approved_at': timezone.now() - timedelta(days=1, hours=1),
                'admin_remarks': 'Verified with field team supervisor.',
                'manual_request': req_yesterday,
            }
        )

        # Sample Pending Request for FA-002
        emp2 = created_employees[1]
        ManualAttendanceRequest.objects.get_or_create(
            employee=emp2,
            attendance_date=yesterday,
            defaults={
                'requested_check_in': timezone.now() - timedelta(days=1, hours=8, minutes=5),
                'requested_check_out': timezone.now() - timedelta(days=1, minutes=30),
                'reason': 'Forgot to check in upon arrival at research site.',
                'status': ManualAttendanceRequest.Status.PENDING,
            }
        )

        self.stdout.write(self.style.SUCCESS("✓ Seed data completed successfully!"))
