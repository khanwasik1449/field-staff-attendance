from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class StrongPasswordValidator:
    """Require a mixed character set so Field Assistant passwords cannot be trivially weak.

    Registered in AUTH_PASSWORD_VALIDATORS so every password set through Django
    (including the admin and `validate_password()`) is bound to the same policy.
    """

    def validate(self, password, user=None):
        checks = {
            'lowercase': any(c.islower() for c in password),
            'uppercase': any(c.isupper() for c in password),
            'digit': any(c.isdigit() for c in password),
            'symbol': any(not c.isalnum() for c in password),
        }
        missing = [name for name, ok in checks.items() if not ok]
        if missing:
            raise ValidationError(
                _("Password must include lowercase, uppercase, digits, and a symbol."),
                code='password_too_common',
            )

    def get_help_text(self):
        return _(
            "Your password must contain at least one lowercase letter, one uppercase "
            "letter, one digit, and one symbol."
        )