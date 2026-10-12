from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


class PasswordPolicyContext:
    """Minimal stand-in for similarity checks before a User row exists.

    UserAttributeSimilarityValidator needs `get_username()`/`email` attributes so it can
    reject passwords that are too close to the person's identity.
    """

    def __init__(self, username='', email='', full_name=''):
        self.username = username
        self.email = email
        self.full_name = full_name

    def get_username(self):
        return self.username


def validate_secure_password(password, user=None, full_name=''):
    """Raise ValidationError when `password` violates the secure password policy.

    Delegates to Django's validators (length, similarity, common/numeric lists) plus the
    project's StrongPasswordValidator (mixed character set) registered in settings.
    `user` may be an actual User (reset flows) or an identity context (create flows).
    """
    if user is None:
        user = PasswordPolicyContext(full_name=full_name)

    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        cleaned = []
        for msg in exc.messages:
            text = str(msg)
            if text.startswith('Password:'):
                text = text.replace('Password:', '', 1).strip()
            if text and text not in cleaned:
                cleaned.append(text)
        raise ValidationError(cleaned)

    if full_name and full_name.strip().lower() in str(password).lower():
        raise ValidationError("Password is too similar to the employee's full name.")
    return password


def looks_secure(password):
    """Cheap boolean pre-check used by bulk upload before creating accounts."""
    pwd = str(password)
    return (
        len(pwd) >= 8
        and any(c.islower() for c in pwd)
        and any(c.isupper() for c in pwd)
        and any(c.isdigit() for c in pwd)
        and any(not c.isalnum() for c in pwd)
    )