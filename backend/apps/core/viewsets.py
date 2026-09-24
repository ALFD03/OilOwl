"""ViewSet genérico: permisos por acción, aislamiento por estación, auditoría y bloqueo."""

from django.db import transaction
from rest_framework import mixins, viewsets

from apps.audit import services as audit

from .context import RequestContext, reset_context, set_context
from .exceptions import ImmutableRecordError, InvalidStateError
from .permissions import ActionPermission
from .scoping import ensure_station_access, scope_queryset, station_id_of


def client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class ContextMixin:
    """Publica el usuario autenticado en el contexto (autoría y auditoría)."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        user = request.user if request.user and request.user.is_authenticated else None
        self._ctx_token = set_context(
            RequestContext(
                user_id=user.pk if user else None,
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            )
        )

    def finalize_response(self, request, response, *args, **kwargs):
        token = getattr(self, "_ctx_token", None)
        if token is not None:
            reset_context(token)
            self._ctx_token = None
        return super().finalize_response(request, response, *args, **kwargs)


class BaseGenericViewSet(ContextMixin, viewsets.GenericViewSet):
    permission_classes = [ActionPermission]
    permission_map: dict = {}
    station_field: str | None = None
    audit_enabled = True

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = scope_queryset(queryset, self.request.user, self.station_field)
        station = self.request.query_params.get("station") if self.station_field else None
        if station:
            queryset = queryset.filter(**{self.station_field: station})
        return queryset

    def check_station(self, instance):
        if self.station_field:
            ensure_station_access(self.request.user, station_id_of(instance, self.station_field))

    def ensure_editable(self, instance):
        if getattr(instance, "is_locked", False):
            raise ImmutableRecordError()
        if hasattr(instance, "is_editable") and not instance.is_editable:
            raise InvalidStateError("Solo se pueden modificar registros en borrador.")

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            self.check_station(instance)
            if self.audit_enabled:
                audit.record("create", instance, after=audit.snapshot(instance))

    def perform_update(self, serializer):
        instance = serializer.instance
        self.ensure_editable(instance)
        before = audit.snapshot(instance) if self.audit_enabled else None
        with transaction.atomic():
            instance = serializer.save()
            self.check_station(instance)
            if self.audit_enabled:
                audit.record("update", instance, before=before, after=audit.snapshot(instance))

    def perform_destroy(self, instance):
        self.ensure_editable(instance)
        before = audit.snapshot(instance) if self.audit_enabled else None
        with transaction.atomic():
            if hasattr(instance, "is_active") and getattr(self, "soft_delete", True):
                instance.is_active = False
                instance.save(update_fields=["is_active", "updated_at", "updated_by"])
                action = "deactivate"
            else:
                instance.delete()
                action = "delete"
            if self.audit_enabled:
                audit.record(action, instance, before=before)


# BaseGenericViewSet va primero: sus perform_* (auditoría, estación, bloqueo) deben
# prevalecer sobre los de los mixins de DRF.
class BaseModelViewSet(
    BaseGenericViewSet,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
):
    """CRUD completo estándar. Los catálogos se desactivan en lugar de borrarse."""


class BaseReadOnlyViewSet(BaseGenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    pass


class BaseAppendOnlyViewSet(
    BaseGenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin
):
    """Registros que solo se crean (ajustes, mediciones): nunca se editan ni borran."""
