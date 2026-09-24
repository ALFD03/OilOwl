"""Registro de auditoría: quién hizo qué, cuándo, desde dónde y con qué valores."""

import json

from django.core.serializers.json import DjangoJSONEncoder

from apps.core.context import get_context

REDACTED = "***"


def snapshot(instance) -> dict:
    data = {}
    for field in instance._meta.concrete_fields:
        if getattr(field, "encrypted", False):
            data[field.name] = REDACTED
            continue
        if field.name in {"password"}:
            continue
        data[field.attname] = field.value_from_object(instance)
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def _station_id(instance):
    station_id = getattr(instance, "station_id", None)
    if station_id is None and instance._meta.model_name == "station":
        station_id = instance.pk
    return station_id


def record(action: str, instance, before: dict | None = None, after: dict | None = None, user_id=None):
    from .models import AuditLog

    ctx = get_context()
    return AuditLog.objects.create(
        user_id=user_id or ctx.user_id,
        action=action,
        app_label=instance._meta.app_label,
        model=instance._meta.model_name,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        station_id=_station_id(instance),
        before=before,
        after=after,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
    )
