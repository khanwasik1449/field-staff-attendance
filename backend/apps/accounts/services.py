import io
import csv
import re
import secrets
import string
from datetime import datetime, date
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from django.utils import timezone
from django.db import transaction

from .models import User, Employee, Department
from apps.audit.services import AuditService
from .password_policy import PasswordPolicyContext, validate_secure_password


def generate_secure_default_password():
    """Policy-compliant random initial password disclosed once to the uploading admin."""
    alphabet = string.ascii_lowercase + string.digits
    body = ''.join(secrets.choice(alphabet) for _ in range(10))
    return f"F@{body}!"


def normalize_header_name(header_val):
    if not header_val:
        return ''
    raw = str(header_val)
    # Strip asterisks, notes inside brackets or parentheses e.g. (Zilla), (YYYY-MM-DD)
    raw = re.sub(r'\(.*?\)', '', raw)
    raw = re.sub(r'\[.*?\]', '', raw)
    raw = raw.replace('*', '').strip()

    cleaned = re.sub(r'[^a-zA-Z0-9_\-\s]', '', raw)
    cleaned = cleaned.strip().lower().replace(' ', '_').replace('-', '_')
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')

    aliases = {
        'employee_id': ['employee_id', 'employeeid', 'id', 'fa_id', 'faid', 'emp_id', 'empid', 'staff_id'],
        'full_name': ['full_name', 'fullname', 'name', 'employee_name', 'assistant_name', 'fa_name'],
        'username': ['username', 'user_name', 'login_username', 'login_id', 'user'],
        'phone': ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact', 'contact_number'],
        'email': ['email', 'email_address', 'mail'],
        'designation': ['designation', 'title', 'position'],
        'password': ['password', 'default_password', 'pass'],
        'department': ['department', 'dept', 'department_code', 'dept_code'],
        'joining_date': ['joining_date', 'join_date', 'date_of_joining', 'start_date'],
        'employee_type': ['employee_type', 'type', 'staff_type', 'employment_type', 'category', 'role_type'],
    }

    for standard_key, alias_list in aliases.items():
        if cleaned in alias_list:
            return standard_key
    return cleaned


def resolve_employee_type(raw_value):
    """Map a free-text Employee Type cell onto a catalog code.

    Matches against the admin-managed EmployeeType catalog by code, name, or
    the historical hardcoded synonyms; falls back to the first active type
    (or 'FIELD_STAFF') so uploads never hard-fail on an unrecognised cell.
    """
    from .models import EmployeeType
    value = (raw_value or '').strip().lower().replace('-', ' ').replace('_', ' ')
    value = re.sub(r'\s+', ' ', value)

    legacy_synonyms = {
        'intern': 'INTERN', 'interns': 'INTERN', 'internship': 'INTERN',
        'trainee': 'INTERN',
        'field staff': 'FIELD_STAFF', 'fieldstaff': 'FIELD_STAFF',
        'field': 'FIELD_STAFF', 'staff': 'FIELD_STAFF',
        'regular': 'FIELD_STAFF', 'permanent': 'FIELD_STAFF',
        'employee': 'FIELD_STAFF',
    }
    if value in legacy_synonyms:
        return legacy_synonyms[value]

    types = list(EmployeeType.objects.all())
    for t in types:
        if t.code.lower() == value or t.name.lower() == value:
            return t.code

    active = [t for t in types if t.is_active]
    if active:
        return active[0].code
    return 'FIELD_STAFF'


class EmployeeBulkUploadService:
    @staticmethod
    def parse_rows(file_obj, filename=""):
        """
        Parses an uploaded .xlsx or .csv file into a list of normalized row dictionaries.
        Returns (rows, error_message).
        """
        lower_name = filename.lower()
        rows = []

        if lower_name.endswith('.csv'):
            try:
                # Read CSV with encoding fallbacks
                content = file_obj.read()
                if isinstance(content, bytes):
                    for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
                        try:
                            text = content.decode(enc)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        return None, "Unable to decode CSV file. Please ensure it is saved in UTF-8 format."
                else:
                    text = content

                reader = csv.reader(io.StringIO(text))
                header_row = next(reader, None)
                if not header_row:
                    return None, "The uploaded CSV file is empty."

                normalized_headers = [normalize_header_name(h) for h in header_row]

                for row_idx, row_values in enumerate(reader, start=2):
                    if not any(v.strip() for v in row_values if v):
                        continue  # skip blank lines
                    row_dict = {}
                    for col_idx, col_key in enumerate(normalized_headers):
                        val = row_values[col_idx].strip() if col_idx < len(row_values) else ""
                        row_dict[col_key] = val
                    row_dict['_row_num'] = row_idx
                    rows.append(row_dict)

            except Exception as e:
                return None, f"Failed to read CSV file: {str(e)}"

        else:
            # Default to Excel (.xlsx)
            try:
                wb = openpyxl.load_workbook(file_obj, data_only=True)
                ws = wb.active
                iter_rows = ws.iter_rows(values_only=True)
                header_row = next(iter_rows, None)

                if not header_row:
                    return None, "The uploaded Excel sheet is empty."

                normalized_headers = [normalize_header_name(h) for h in header_row]

                for row_idx, row_values in enumerate(iter_rows, start=2):
                    if not any(v is not None and str(v).strip() for v in row_values):
                        continue  # skip blank rows
                    row_dict = {}
                    for col_idx, col_key in enumerate(normalized_headers):
                        val = row_values[col_idx] if col_idx < len(row_values) else ""
                        if val is None:
                            val = ""
                        elif isinstance(val, (datetime, date)):
                            val = val.strftime('%Y-%m-%d')
                        else:
                            val = str(val).strip()
                        row_dict[col_key] = val
                    row_dict['_row_num'] = row_idx
                    rows.append(row_dict)

            except Exception as e:
                return None, f"Failed to read Excel file (.xlsx): {str(e)}"

        return rows, None

    @classmethod
    def process_bulk_upload(cls, file_obj, filename="", request=None, admin_user=None):
        """
        Processes bulk upload of Field Assistants.
        Validates, assigns an employee type, and creates user accounts atomically.
        """
        rows, parse_error = cls.parse_rows(file_obj, filename)
        if parse_error:
            return {
                'success': False,
                'detail': parse_error,
                'total_rows': 0,
                'created_count': 0,
                'updated_count': 0,
                'failed_count': 0,
                'created_employees': [],
                'errors': [{'row_number': 0, 'error': parse_error}]
            }

        if not rows:
            return {
                'success': False,
                'detail': "No data rows found in the uploaded file.",
                'total_rows': 0,
                'created_count': 0,
                'updated_count': 0,
                'failed_count': 0,
                'created_employees': [],
                'errors': [{'row_number': 0, 'error': "No data rows found."}]
            }

        all_departments = list(Department.objects.all())
        default_dept = all_departments[0] if all_departments else None

        created_employees = []
        updated_employees = []
        errors = []

        user_performing_action = admin_user or (request.user if request else None)

        for row in rows:
            row_num = row.get('_row_num', 0)
            emp_id = row.get('employee_id', '').strip()
            full_name = row.get('full_name', '').strip()

            # Required validations
            if not emp_id:
                errors.append({
                    'row_number': row_num,
                    'employee_id': '',
                    'error': "Employee ID is required."
                })
                continue

            if not full_name:
                errors.append({
                    'row_number': row_num,
                    'employee_id': emp_id,
                    'error': f"Full Name is required for Employee ID {emp_id}."
                })
                continue

            # Resolve Department
            dept_val = row.get('department', '').strip()
            target_dept = default_dept
            if dept_val:
                matched_dept = next((d for d in all_departments if d.code.lower() == dept_val.lower() or d.name.lower() == dept_val.lower()), None)
                if matched_dept:
                    target_dept = matched_dept

            employee_type = resolve_employee_type(row.get('employee_type', ''))

            phone = row.get('phone', '').strip()
            email = row.get('email', '').strip()
            designation = row.get('designation', '').strip() or 'Field Assistant'
            provided_password = row.get('password', '').strip() or ''

            joining_date_val = row.get('joining_date', '').strip()
            joining_date = timezone.localdate()
            if joining_date_val:
                try:
                    joining_date = datetime.strptime(joining_date_val, '%Y-%m-%d').date()
                except ValueError:
                    try:
                        joining_date = datetime.strptime(joining_date_val, '%d-%m-%Y').date()
                    except ValueError:
                        joining_date = timezone.localdate()

            # Resolve or auto-generate username
            username = row.get('username', '').strip()
            if not username:
                cleaned_id = re.sub(r'[^a-zA-Z0-9]', '', emp_id).lower()
                username = cleaned_id if cleaned_id else f"fa_{emp_id.lower()}"

            # Secure password policy: reject weak passwords provided in the file and
            # generate a compliant random default when the field is left blank.
            password = ''
            if provided_password:
                try:
                    validate_secure_password(
                        provided_password,
                        user=PasswordPolicyContext(username=username, email=email, full_name=full_name),
                        full_name=full_name,
                    )
                except Exception as err:
                    messages = ' '.join(getattr(err, 'messages', [])) or str(err)
                    errors.append({
                        'row_number': row_num,
                        'employee_id': emp_id,
                        'error': f"Weak password for {emp_id}: {messages}"
                    })
                    continue
                password = provided_password
            new_password = password or generate_secure_default_password()

            existing_emp = Employee.objects.filter(employee_id__iexact=emp_id).first()

            try:
                with transaction.atomic():
                    if existing_emp:
                        # Update existing Field Assistant
                        existing_emp.full_name = full_name
                        if phone:
                            existing_emp.phone = phone
                        if target_dept:
                            existing_emp.department = target_dept
                        if designation:
                            existing_emp.designation = designation
                        existing_emp.employee_type = employee_type
                        existing_emp.is_active = True
                        existing_emp.save()

                        # Update User fields
                        user = existing_emp.user
                        if email and user.email != email:
                            user.email = email
                            user.save(update_fields=['email'])

                        if password:
                            user.set_password(password)
                            user.save(update_fields=['password'])

                        AuditService.log(
                            user=user_performing_action,
                            action='USER_UPDATED',
                            object_type='Employee',
                            object_id=existing_emp.id,
                            request=request,
                            remarks=f"Bulk upload updated FA {existing_emp.employee_id} ({existing_emp.get_employee_type_display()})"
                        )

                        updated_employees.append({
                            'employee_id': existing_emp.employee_id,
                            'full_name': existing_emp.full_name,
                            'username': user.username,
                            'employee_type': existing_emp.employee_type,
                            'employee_type_display': existing_emp.get_employee_type_display(),
                            'action': 'UPDATED'
                        })

                    else:
                        # Check username collision with another user
                        if User.objects.filter(username=username).exists():
                            base_uname = username
                            suffix = 1
                            while User.objects.filter(username=f"{base_uname}{suffix}").exists():
                                suffix += 1
                            username = f"{base_uname}{suffix}"

                        # Create new user and employee profile
                        user = User.objects.create_user(
                            username=username,
                            password=new_password,
                            email=email,
                            role=User.Role.FIELD_ASSISTANT
                        )

                        employee = Employee.objects.create(
                            user=user,
                            employee_id=emp_id,
                            full_name=full_name,
                            phone=phone,
                            department=target_dept,
                            employee_type=employee_type,
                            designation=designation,
                            joining_date=joining_date,
                            is_active=True
                        )

                        AuditService.log(
                            user=user_performing_action,
                            action='USER_CREATED',
                            object_type='Employee',
                            object_id=employee.id,
                            request=request,
                            new_state={
                                'employee_id': employee.employee_id,
                                'full_name': employee.full_name,
                                'employee_type': employee.employee_type,
                            },
                            remarks=f"Bulk upload created new FA {employee.employee_id} ({employee.full_name}, {employee.get_employee_type_display()})"
                        )

                        created_employees.append({
                            'employee_id': employee.employee_id,
                            'full_name': employee.full_name,
                            'username': user.username,
                            'password': new_password,
                            'employee_type': employee.employee_type,
                            'employee_type_display': employee.get_employee_type_display(),
                            'action': 'CREATED'
                        })

            except Exception as err:
                errors.append({
                    'row_number': row_num,
                    'employee_id': emp_id,
                    'error': f"Failed to save {emp_id}: {str(err)}"
                })

        total_processed = len(created_employees) + len(updated_employees)
        success_msg = f"Bulk upload completed: {len(created_employees)} created, {len(updated_employees)} updated, {len(errors)} errors."

        return {
            'success': len(errors) == 0 or total_processed > 0,
            'detail': success_msg,
            'total_rows': len(rows),
            'created_count': len(created_employees),
            'updated_count': len(updated_employees),
            'failed_count': len(errors),
            'created_employees': created_employees,
            'updated_employees': updated_employees,
            'errors': errors
        }

    @staticmethod
    def generate_excel_template():
        """
        Generates a professionally styled Excel workbook template (.xlsx)
        with sample rows and guidance notes.
        """
        wb = openpyxl.Workbook()

        # Sheet 1: Field Assistants Upload Sheet
        ws1 = wb.active
        ws1.title = "Field Assistants"
        ws1.views.sheetView[0].showGridLines = True

        headers = [
            ("Employee ID *", 18),
            ("Full Name *", 24),
            ("Username", 18),
            ("Employee Type", 18),
            ("Phone Number", 18),
            ("Email Address", 24),
            ("Designation", 20),
            ("Password", 16),
            ("Joining Date (YYYY-MM-DD)", 25),
        ]

        header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        border_thin = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        for col_idx, (header_text, width) in enumerate(headers, start=1):
            cell = ws1.cell(row=1, column=col_idx, value=header_text)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border_thin
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            ws1.column_dimensions[col_letter].width = width

        ws1.row_dimensions[1].height = 28

        sample_rows = [
            ["FA-101", "Mohammad Rahim Uddin", "rahim101", "Field Staff", "01711223344",
             "rahim@example.com", "Field Assistant", "Secure@123", timezone.localdate().strftime('%Y-%m-%d')],
            ["FA-102", "Fatema Begum", "fatema102", "Field Staff", "01819334455",
             "fatema@example.com", "Senior Field Assistant", "Secure@123", timezone.localdate().strftime('%Y-%m-%d')],
            ["IN-101", "Anowar Hossain", "anowar101", "Intern", "01912445566",
             "anowar@example.com", "Intern", "Secure@123", timezone.localdate().strftime('%Y-%m-%d')],
        ]

        sample_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        sample_font = Font(name="Calibri", size=10, color="334155")

        for r_idx, row_data in enumerate(sample_rows, start=2):
            ws1.row_dimensions[r_idx].height = 22
            for c_idx, val in enumerate(row_data, start=1):
                cell = ws1.cell(row=r_idx, column=c_idx, value=val)
                cell.fill = sample_fill
                cell.font = sample_font
                cell.border = border_thin
                if c_idx in (1, 3, 4, 5, 8, 9):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

        # Sheet 2: Employee Types Reference Guide
        ws2 = wb.create_sheet(title="Employee Types Guide")
        ws2.views.sheetView[0].showGridLines = True

        guide_headers = [
            ("Employee Type", 24),
            ("Description", 60),
        ]
        guide_header_fill = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
        for col_idx, (header_text, width) in enumerate(guide_headers, start=1):
            cell = ws2.cell(row=1, column=col_idx, value=header_text)
            cell.fill = guide_header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border_thin
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            ws2.column_dimensions[col_letter].width = width

        guide_rows = [
            ("Field Staff", "Regular field-based staff. Default type when left blank."),
            ("Intern", "Interns and trainees on a temporary arrangement."),
        ]
        for r_idx, row_data in enumerate(guide_rows, start=2):
            for c_idx, val in enumerate(row_data, start=1):
                cell = ws2.cell(row=r_idx, column=c_idx, value=val)
                cell.font = sample_font
                cell.border = border_thin
                cell.alignment = Alignment(horizontal="left", vertical="center")

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()

    @staticmethod
    def generate_csv_template():
        """
        Generates a standard CSV template for quick import.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        headers = [
            "Employee ID",
            "Full Name",
            "Username",
            "Employee Type",
            "Phone Number",
            "Email Address",
            "Designation",
            "Password",
            "Joining Date"
        ]
        writer.writerow(headers)

        writer.writerow([
            "FA-101", "Mohammad Rahim", "rahim101", "Field Staff",
            "01711223344", "rahim@example.com",
            "Field Assistant", "Secure@123", timezone.localdate().strftime('%Y-%m-%d')
        ])
        writer.writerow([
            "IN-101", "Fatema Begum", "fatema101", "Intern",
            "01819334455", "fatema@example.com",
            "Intern", "Secure@123", timezone.localdate().strftime('%Y-%m-%d')
        ])

        return output.getvalue().encode('utf-8-sig')
