from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_remove_employee_project_remove_employee_district_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='employee',
            name='pin_failed_attempts',
        ),
        migrations.RemoveField(
            model_name='employee',
            name='pin_hash',
        ),
        migrations.RemoveField(
            model_name='employee',
            name='pin_locked_until',
        ),
        migrations.RemoveField(
            model_name='employee',
            name='pin_set_at',
        ),
    ]