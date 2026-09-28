"""Nomenclatura de códigos: <prefijo de estación>-<tipo de elemento>-<####> (p. ej. PLN-SU-0001).

- El prefijo de estación son 3 letras mayúsculas definidas al crear la estación (inmutable).
- El número es correlativo por estación y tipo, nunca se reutiliza (ni al desactivar).
- El código se asigna al crear el elemento y no se edita.
- Los catálogos compartidos por todas las estaciones (combustibles) no llevan prefijo de
  estación: <tipo>-<####> (p. ej. CB-0001), con un correlativo global.
"""

import re

from django.core.exceptions import ValidationError
from django.db import transaction

STATION_CODE_RE = re.compile(r"^[A-Z]{3}$")

# Tipo de elemento → letras del código.
ISLAND = "IS"
PUMP = "SU"
TANK = "TQ"
POS = "PV"
BIOPAGO = "BP"
ATTENDANT = "BO"
SHIFT_TEMPLATE = "TU"
FUEL = "CB"  # global, sin prefijo de estación


def normalize_station_code(value: str) -> str:
    return (value or "").strip().upper()


def validate_station_code(value: str) -> None:
    if not STATION_CODE_RE.match(value or ""):
        raise ValidationError("El prefijo de la estación debe tener exactamente 3 letras (A-Z).")


def format_code(station_code: str | None, prefix: str, number: int) -> str:
    return f"{station_code}-{prefix}-{number:04d}" if station_code else f"{prefix}-{number:04d}"


def next_code(station_id, prefix: str) -> str:
    """Reserva el siguiente número bloqueando la fila de la estación (sin carreras entre usuarios).

    Sin estación, el correlativo es global y se bloquea la fila de su secuencia.
    """
    from apps.catalog.models import CodeSequence, Station

    with transaction.atomic():
        if station_id is None:
            CodeSequence.objects.get_or_create(station=None, prefix=prefix)
            sequence = CodeSequence.objects.select_for_update().get(station=None, prefix=prefix)
            sequence.last += 1
            sequence.save(update_fields=["last"])
            return format_code(None, prefix, sequence.last)
        station = Station.objects.select_for_update().get(pk=station_id)
        sequence, _ = CodeSequence.objects.get_or_create(station=station, prefix=prefix)
        sequence.last += 1
        sequence.save(update_fields=["last"])
        return format_code(station.code, prefix, sequence.last)


class AutoCodeMixin:
    """Asigna el código al crear. Cada modelo define `code_prefix()` y `code_station_id()`."""

    def code_prefix(self) -> str:  # pragma: no cover - lo implementa cada modelo
        raise NotImplementedError

    def code_station_id(self):  # pragma: no cover
        return self.station_id

    def save(self, *args, **kwargs):
        if self._state.adding and not self.code:
            self.code = next_code(self.code_station_id(), self.code_prefix())
        super().save(*args, **kwargs)
