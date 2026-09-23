"""Conciliación de tanques: inventario esperado vs. medido y cuantificación de la merma."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.audit import services as audit
from apps.catalog.models import FuelPrice
from apps.closures.models import MeterReading
from apps.core.choices import Currency
from apps.core.exceptions import BusinessRuleError
from apps.core.models import LockStatus
from apps.core.money import ZERO, q_liters, q_money, to_decimal, usd_to_ves
from apps.rates.models import ExchangeRate

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


def opening_reading_for(tank: Tank) -> TankReading | None:
    last = Reconciliation.objects.filter(tank=tank).order_by("-closing_reading__measured_at").first()
    if last:
        return last.closing_reading
    return tank.readings.order_by("measured_at").first()


@transaction.atomic
def reconcile(
    tank: Tank, closing: TankReading, shift=None, rate: Decimal | None = None, notes: str = ""
) -> Reconciliation:
    if closing.tank_id != tank.pk:
        raise BusinessRuleError("La medición no corresponde al tanque.")
    opening = opening_reading_for(tank)
    if opening is None or opening.pk == closing.pk or opening.measured_at >= closing.measured_at:
        raise BusinessRuleError("Se necesita una medición anterior para conciliar el tanque.")

    deliveries = q_liters(
        Delivery.objects.filter(
            tank=tank, delivered_at__gt=opening.measured_at, delivered_at__lte=closing.measured_at
        ).aggregate(total=Sum("liters"))["total"]
        or ZERO
    )
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


def reconcile_pending_tanks(shift) -> list[Reconciliation]:
    """Concilia automáticamente cada tanque con una medición nueva desde su última conciliación."""
    results = []
    for tank in Tank.objects.filter(station_id=shift.station_id, is_active=True):
        closing = tank.readings.order_by("-measured_at").first()
        opening = opening_reading_for(tank)
        if closing and opening and closing.measured_at > opening.measured_at:
            results.append(reconcile(tank, closing, shift=shift, rate=shift.rate))
    return results
