from django.db import transaction

from apps.audit import services as audit

from . import bcv
from .models import ExchangeRate


@transaction.atomic
def sync_from_bcv(day=None) -> tuple[ExchangeRate, bool]:
    """Guarda la tasa del BCV si aún no existe para esa fecha valor. Devuelve (tasa, creada)."""
    result = bcv.fetch(day)
    existing = ExchangeRate.objects.filter(valid_date=result.valid_date, source=ExchangeRate.Source.BCV).first()
    if existing:
        return existing, False
    rate = ExchangeRate.objects.create(valid_date=result.valid_date, rate=result.rate, source=ExchangeRate.Source.BCV)
    audit.record("create", rate, after=audit.snapshot(rate))
    return rate, True
