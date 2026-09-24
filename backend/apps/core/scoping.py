"""Aislamiento por estación: cada usuario solo ve y opera sus estaciones."""

from rest_framework.exceptions import PermissionDenied


def allowed_station_ids(user) -> set | None:
    """None significa acceso a todas las estaciones (superusuario)."""
    if user.is_superuser:
        return None
    cached = getattr(user, "_station_ids_cache", None)
    if cached is None:
        cached = set(user.station_memberships.values_list("station_id", flat=True))
        user._station_ids_cache = cached
    return cached


def resolve_path(instance, path: str):
    value = instance
    for part in path.split("__"):
        if value is None:
            return None
        value = getattr(value, part)
    return value


def station_id_of(instance, station_field: str):
    if station_field.endswith("station"):
        parent_path, _, _ = station_field.rpartition("__")
        parent = resolve_path(instance, parent_path) if parent_path else instance
        return getattr(parent, "station_id", None) if parent is not None else None
    station = resolve_path(instance, station_field)
    return getattr(station, "pk", station)


def ensure_station_access(user, station_id) -> None:
    allowed = allowed_station_ids(user)
    if allowed is None:
        return
    if station_id is None or station_id not in allowed:
        raise PermissionDenied("No tiene acceso a esta estación.")


def scope_queryset(queryset, user, station_field: str | None):
    if not station_field:
        return queryset
    allowed = allowed_station_ids(user)
    if allowed is None:
        return queryset
    return queryset.filter(**{f"{station_field}__in": allowed})
