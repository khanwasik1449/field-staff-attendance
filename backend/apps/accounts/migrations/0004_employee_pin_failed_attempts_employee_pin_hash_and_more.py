from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def backfill_pins(apps, schema_editor):
    Employee = apps.get_model('accounts', 'Employee')
    for employee in Employee.objects.filter(pin_hash=''):
        employee.pin_hash = make_password(employee.employee_id.strip())
        employee.save(update_fields=['pin_hash'])


def clear_pins(apps, schema_editor):
    Employee = apps.get_model('accounts', 'Employee')
    Employee.objects.update(pin_hash='')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_employee_district_employee_division_employee_upazila_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='pin_failed_attempts',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='employee',
            name='pin_hash',
            field=models.CharField(blank=True, default='', help_text='Encrypted (PBKDF2-hashed) login PIN. FRA PIN defaults to the employee ID.', max_length=128),
        ),
        migrations.AddField(
            model_name='employee',
            name='pin_locked_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='pin_set_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_pins, clear_pins),
    ]
