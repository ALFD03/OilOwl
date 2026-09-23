from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class User(AbstractUser):
    """Usuario del sistema. Sus permisos provienen de sus roles (grupos) y de asignaciones directas."""

    email = models.EmailField("correo", blank=True)
    failed_login_count = models.PositiveSmallIntegerField(default=0, editable=False)
    locked_until = models.DateTimeField(null=True, blank=True, editable=False)
    must_change_password = models.BooleanField(default=False)

    objects = UserManager()

    class Meta:
        ordering = ["username"]
        permissions = [
            ("set_user_password", "Puede restablecer la contraseña de otros usuarios"),
            ("unlock_user", "Puede desbloquear usuarios"),
        ]

    def save(self, *args, **kwargs):
        self.username = self.username.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_login_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def register_failed_login(self) -> None:
        self.failed_login_count += 1
        if self.failed_login_count >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
            self.locked_until = timezone.now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            self.failed_login_count = 0
        User.objects.filter(pk=self.pk).update(
            failed_login_count=self.failed_login_count, locked_until=self.locked_until
        )

    def register_successful_login(self) -> None:
        if self.failed_login_count or self.locked_until:
            self.failed_login_count = 0
            self.locked_until = None
            User.objects.filter(pk=self.pk).update(failed_login_count=0, locked_until=None)

    def effective_permissions(self) -> list[str]:
        if not self.is_active:
            return []
        return sorted(self.get_all_permissions())


class StationMembership(BaseModel):
    """Estaciones a las que un usuario tiene acceso."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="station_memberships")
    station = models.ForeignKey("catalog.Station", on_delete=models.PROTECT, related_name="memberships")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "station"], name="uniq_user_station")]
        default_permissions = ()
