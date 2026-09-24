"""Tasa oficial BCV (Bs/USD) obtenida de DolarApi.

Endpoint: {BCV_API_URL} con la fecha en formato YYYY/MM/DD. Responde, p. ej.:
    {"fuente": "oficial", "compra": null, "venta": null, "promedio": 853.4993, "fecha": "2026-09-23"}
Los fines de semana y feriados no hay publicación (404): se usa la última disponible.
"""

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings
from django.utils import timezone

from apps.core.money import q_rate

logger = logging.getLogger(__name__)

MAX_LOOKBACK_DAYS = 7


class BCVError(Exception):
    pass


@dataclass(frozen=True)
class BCVRate:
    rate: Decimal
    valid_date: date


def parse(payload: dict) -> BCVRate:
    try:
        rate = Decimal(str(payload["promedio"]))
        valid_date = date.fromisoformat(payload["fecha"][:10])
    except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
        raise BCVError("Respuesta de tasa con formato inesperado") from exc
    if rate <= 0:
        raise BCVError("La tasa debe ser positiva")
    return BCVRate(rate=q_rate(rate), valid_date=valid_date)


def fetch_for(day: date) -> BCVRate | None:
    """Tasa publicada exactamente para `day`, o None si ese día no hubo publicación."""
    url = settings.BCV_API_URL.format(date=day.strftime("%Y/%m/%d"))
    try:
        response = requests.get(url, timeout=settings.BCV_TIMEOUT, headers={"Accept": "application/json"})
    except requests.RequestException as exc:
        logger.warning("Fallo al consultar la tasa: %s", exc)
        raise BCVError("No se pudo consultar la tasa oficial") from exc
    if response.status_code == 404 or not response.content.strip():
        return None
    if response.status_code != 200:
        raise BCVError(f"El servicio de tasas respondió {response.status_code}")
    try:
        return parse(response.json())
    except ValueError as exc:
        raise BCVError("Respuesta de tasa ilegible") from exc


def fetch(day: date | None = None) -> BCVRate:
    """Tasa vigente para `day` (hoy por defecto): la última publicada en los 7 días previos."""
    day = day or timezone.localdate()
    for offset in range(MAX_LOOKBACK_DAYS + 1):
        result = fetch_for(day - timedelta(days=offset))
        if result is not None:
            return result
    raise BCVError(f"No hay tasa publicada en los {MAX_LOOKBACK_DAYS} días previos a {day}")
