"""Conciliación de tanques: inventario esperado vs. medido y cuantificación de la merma."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog.models import FuelPrice
from apps.closures.models import MeterReading
from apps.core.choices import Currency
from apps.core.exceptions import BusinessRuleError
from apps.core.models import LockStatus
from apps.core.money import ZERO, q_liters, q_money, to_decimal, usd_to_ves
from apps.rates.models import ExchangeRate

from . import calibration
from .models import Delivery, Reconciliation, Tank, TankReading


def _price_usd(tank: Tank, rate: Decimal) -> Decimal:
    price = FuelPrice.objects.current(tank.station_id, tank.fuel_type_id)
    if price is None:
        return ZERO
    if price.currency == Currency.USD:
        return price.price
    return price.price / rate if rate else ZERO


def sold_liters(tank: Tank, start, end) -> Decimal:
    """Litros despachados por los surtidores del tanque en cierres bloqueados dentro del período."""
    total = MeterReading.objects.filter(
        pump__tank=tank,
        closure__status=LockStatus.LOCKED,
        closure__locked_at__gt=start,
        closure__locked_at__lte=end,
    ).aggregate(total=Sum("liters"))["total"]
    return q_liters(total or ZERO)


def shift_sold_liters(tank: Tank, shift) -> Decimal:
    """Litros despachados por los surtidores del tanque en los cierres de la jornada.

    Al cerrar la jornada todos sus cierres están bloqueados; antes de eso es una vista previa
    con lo registrado hasta el momento.
    """
    total = MeterReading.objects.filter(pump__tank=tank, closure__shift=shift).aggregate(total=Sum("liters"))["total"]
    return q_liters(total or ZERO)


def deliveries_between(tank: Tank, start, end, shift=None) -> Decimal:
    """Descargas del período. Las registradas en la jornada cuentan aunque su hora sea anterior."""
    window = Q(delivered_at__gt=start, delivered_at__lte=end)
    if shift is not None:
        window = (window & Q(shift__isnull=True)) | Q(shift=shift)
    total = Delivery.objects.filter(window, tank=tank).aggregate(total=Sum("liters"))["total"]
    return q_liters(total or ZERO)


def shift_reading(tank: Tank, shift, kind) -> TankReading | None:
    return TankReading.objects.filter(tank=tank, shift=shift, kind=kind).first()


def opening_reading_for(tank: Tank, shift=None) -> TankReading | None:
    """Medición inicial de la conciliación: la de apertura de la jornada, o la última conciliada."""
    if shift is not None:
        opening = shift_reading(tank, shift, TankReading.Kind.OPENING)
        if opening:
            return opening
    last = Reconciliation.objects.filter(tank=tank).order_by("-closing_reading__measured_at").first()
    if last:
        return last.closing_reading
    return tank.readings.order_by("measured_at").first()


def record_shift_readings(shift, kind, items) -> list[TankReading]:
    """Registra la medición (cm) de todos los tanques activos de la estación al abrir o cerrar la jornada."""
    tanks = {t.pk: t for t in Tank.objects.filter(station_id=shift.station_id, is_active=True)}
    heights = {}
    for item in items or []:
        tank = item["tank"]
        if tank.pk not in tanks:
            raise BusinessRuleError(f"El tanque {tank.code} no está activo en la estación de la jornada.")
        if tank.pk in heights:
            raise BusinessRuleError(f"El tanque {tank.code} está repetido.")
        heights[tank.pk] = item["height_cm"]
    missing = [t.code for pk, t in tanks.items() if pk not in heights]
    if missing:
        raise BusinessRuleError(f"Indique la medición en cm de los tanques: {', '.join(sorted(missing))}.")
    if TankReading.objects.filter(shift=shift, kind=kind).exists():
        raise BusinessRuleError("La medición de tanques de esta jornada ya fue registrada.")

    now = timezone.now()
    readings = []
    for pk, height in heights.items():
        tank = tanks[pk]
        reading = TankReading.objects.create(
            station_id=shift.station_id,
            tank=tank,
            shift=shift,
            kind=kind,
            measured_at=now,
            height_cm=height,
            liters=calibration.liters_at(tank, height),
        )
        audit.record("create", reading, after=audit.snapshot(reading))
        readings.append(reading)
    return readings


@transaction.atomic
def reconcile(
    tank: Tank, closing: TankReading, shift=None, rate: Decimal | None = None, notes: str = ""
) -> Reconciliation:
    if closing.tank_id != tank.pk:
        raise BusinessRuleError("La medición no corresponde al tanque.")
    opening = opening_reading_for(tank, shift)
    if opening is None or opening.pk == closing.pk or opening.measured_at >= closing.measured_at:
        raise BusinessRuleError("Se necesita una medición anterior para conciliar el tanque.")

    # Con medición de apertura de la jornada, el vendido y las descargas son los de la jornada;
    # si no, los del período entre ambas mediciones.
    shift_scope = shift if shift is not None and opening.shift_id == shift.pk else None
    deliveries = deliveries_between(tank, opening.measured_at, closing.measured_at, shift_scope)
    if shift_scope is not None:
        sold = shift_sold_liters(tank, shift_scope)
    else:
        sold = sold_liters(tank, opening.measured_at, closing.measured_at)
    expected = q_liters(opening.liters + deliveries - sold)
    variance = q_liters(closing.liters - expected)
    base = sold if sold else expected
    variance_pct = (variance / base * 100).quantize(Decimal("0.0001")) if base else ZERO
    within = abs(variance_pct) <= tank.tolerance_pct

    if rate is None:
        current = ExchangeRate.objects.current()
        rate = current.rate if current else ZERO
    price_usd = to_decimal(_price_usd(tank, rate)).quantize(Decimal("0.0001"))
    variance_usd = q_money(variance * price_usd)

    reconciliation = Reconciliation.objects.create(
        station_id=tank.station_id,
        tank=tank,
        shift=shift,
        opening_reading=opening,
        closing_reading=closing,
        opening_liters=opening.liters,
        deliveries_liters=deliveries,
        sold_liters=sold,
        expected_liters=expected,
        measured_liters=closing.liters,
        variance_liters=variance,
        variance_pct=variance_pct,
        tolerance_pct=tank.tolerance_pct,
        within_tolerance=within,
        price_usd=price_usd,
        rate=rate,
        variance_usd=variance_usd,
        variance_ves=usd_to_ves(variance_usd, rate),
        notes=notes,
    )
    audit.record("create", reconciliation, after=audit.snapshot(reconciliation))
    return reconciliation


def reconcile_shift(shift, closing_readings) -> list[Reconciliation]:
    """Concilia cada tanque medido al cerrar la jornada. Sin medición anterior, la de cierre queda como base."""
    results = []
    for closing in closing_readings:
        opening = opening_reading_for(closing.tank, shift)
        if opening and opening.measured_at < closing.measured_at:
            results.append(reconcile(closing.tank, closing, shift=shift, rate=shift.rate))
    return results


def shift_tank_status(shift) -> list[dict]:
    """Estado de cada tanque en la jornada: apertura, descargas, vendido, esperado y, si ya cerró, la merma."""
    readings = {(r.tank_id, r.kind): r for r in TankReading.objects.filter(shift=shift)}
    reconciliations = {r.tank_id: r for r in Reconciliation.objects.filter(shift=shift)}
    tank_ids = {tank_id for tank_id, _ in readings} | set(reconciliations)
    tanks = Tank.objects.filter(Q(station_id=shift.station_id, is_active=True) | Q(pk__in=tank_ids)).select_related(
        "fuel_type"
    )
    now = timezone.now()
    rows = []
    for tank in tanks.order_by("code"):
        opening = readings.get((tank.pk, TankReading.Kind.OPENING))
        closing = readings.get((tank.pk, TankReading.Kind.CLOSING))
        reconciliation = reconciliations.get(tank.pk)
        if reconciliation:
            deliveries, sold = reconciliation.deliveries_liters, reconciliation.sold_liters
        elif opening:
            deliveries = deliveries_between(tank, opening.measured_at, closing.measured_at if closing else now, shift)
            sold = shift_sold_liters(tank, shift)
        else:
            deliveries = sold = None
        rows.append(
            {
                "tank": tank,
                "opening": opening,
                "closing": closing,
                "deliveries_liters": deliveries,
                "sold_liters": sold,
                "expected_liters": (
                    reconciliation.expected_liters
                    if reconciliation
                    else q_liters(opening.liters + deliveries - sold)
                    if opening
                    else None
                ),
                "reconciliation": reconciliation,
            }
        )
    return rows
