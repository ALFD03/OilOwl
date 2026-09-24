"""Modelos base reutilizables por todos los módulos."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .context import current_user_id
from .exceptions import ImmutableRecordError


class BaseModel(models.Model):
    """PK UUID, marcas de tiempo y autoría automática."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, editable=False, on_delete=models.PROTECT, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, editable=False, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        user_id = current_user_id()
        if user_id:
            if self._state.adding and not self.created_by_id:
                self.created_by_id = user_id
            self.updated_by_id = user_id
        super().save(*args, **kwargs)


class ActiveQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True)


class CatalogModel(BaseModel):
    """Elemento de catálogo: se desactiva en lugar de borrarse."""

    code = models.CharField("código", max_length=32)
    name = models.CharField("nombre", max_length=120)
    is_active = models.BooleanField("activo", default=True)

    objects = ActiveQuerySet.as_manager()

    class Meta(BaseModel.Meta):
        abstract = True
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} · {self.name}"


class StationScopedModel(BaseModel):
    """Registro que pertenece a una estación."""

    station = models.ForeignKey("catalog.Station", on_delete=models.PROTECT, related_name="+", verbose_name="estación")

    class Meta(BaseModel.Meta):
        abstract = True


class StationCatalogModel(CatalogModel):
    station = models.ForeignKey("catalog.Station", on_delete=models.PROTECT, related_name="+", verbose_name="estación")

    class Meta(CatalogModel.Meta):
        abstract = True


class LockStatus(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    SUBMITTED = "SUBMITTED", "Enviado"
    LOCKED = "LOCKED", "Bloqueado"


class LockableModel(BaseModel):
    """Registro que, una vez bloqueado, no puede modificarse ni eliminarse.

    Esta es la primera capa; la base de datos la refuerza con triggers (ver core.sql).
    """

    status = models.CharField("estado", max_length=12, choices=LockStatus.choices, default=LockStatus.DRAFT)
    locked_at = models.DateTimeField(null=True, blank=True, editable=False)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, editable=False, on_delete=models.PROTECT, related_name="+"
    )
    prev_hash = models.CharField(max_length=64, blank=True, editable=False)
    content_hash = models.CharField(max_length=64, blank=True, editable=False, db_index=True)

    class Meta(BaseModel.Meta):
        abstract = True

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._loaded_status = getattr(instance, "status", None)
        return instance

    @property
    def is_locked(self) -> bool:
        return getattr(self, "_loaded_status", None) == LockStatus.LOCKED

    @property
    def is_editable(self) -> bool:
        return self.status == LockStatus.DRAFT and not self.is_locked

    def save(self, *args, **kwargs):
        if not self._state.adding and self.is_locked:
            raise ImmutableRecordError()
        super().save(*args, **kwargs)
        self._loaded_status = self.status

    def delete(self, *args, **kwargs):
        if self.is_locked or self.status == LockStatus.LOCKED:
            raise ImmutableRecordError()
        return super().delete(*args, **kwargs)

    def mark_locked(self, user_id: int | None, prev_hash: str, content_hash: str) -> None:
        self.status = LockStatus.LOCKED
        self.locked_at = timezone.now()
        self.locked_by_id = user_id
        self.prev_hash = prev_hash
        self.content_hash = content_hash
