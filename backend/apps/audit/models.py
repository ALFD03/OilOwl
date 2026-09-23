from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models


class AuditLog(models.Model):
    """Bitácora append-only: la base de datos impide UPDATE y DELETE (ver migración)."""

    ts = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=32, db_index=True)
    app_label = models.CharField(max_length=64)
    model = models.CharField(max_length=64)
    object_id = models.CharField(max_length=64, db_index=True)
    object_repr = models.CharField(max_length=255, blank=True)
    station_id = models.UUIDField(null=True, blank=True, db_index=True)
    before = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    after = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-ts"]
        indexes = [models.Index(fields=["app_label", "model", "object_id"])]
        default_permissions = ("view",)

    def __str__(self):
        return f"{self.ts:%Y-%m-%d %H:%M} {self.action} {self.app_label}.{self.model}:{self.object_id}"
