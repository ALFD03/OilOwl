"""Reglas de negocio del cierre de caja por isla.

Flujo: abrir (lecturas iniciales) → registrar lecturas finales y arqueo → enviar → bloquear.
Todos los montos se recalculan en el servidor; el cliente nunca envía totales.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog.models import Attendant, Denomination, FuelPrice, Island, PaymentTerminal, Pump, Station
from apps.core import hashing
from apps.core.choices import Currency
from apps.core.exceptions import BusinessRuleError, InvalidStateError
from apps.core.models import LockStatus
from apps.core.money import (
    ZERO,
    liters_from_usd,
    meter_delta,
    q_money,
    to_decimal,
    to_usd,
    to_ves,
    usd_to_ves,
    ves_to_usd,
)

from .models import CASH_METHOD_CURRENCY, Closure, ClosureLine, MeterReading, PaymentMethod

TERMINAL_METHODS = {PaymentMethod.POS: PaymentTerminal.Kind.POS, PaymentMethod.BIOPAGO: PaymentTerminal.Kind.BIOPAGO}


# ----------------------------------------------------------------------------- lecturas


def last_final_reading(pump: Pump) -> Decimal | None:
    reading = (
        MeterReading.objects.filter(pump=pump, final__isnull=False)
        .order_by("-closure__shift__date", "-closure__created_at")
        .values_list("final", flat=True)
        .first()
    )
    return reading


def current_price(station_id, fuel_type_id, at=None) -> FuelPrice:
    price = FuelPrice.objects.current(station_id, fuel_type_id, at)
    if price is None:
        raise BusinessRuleError(f"No hay precio vigente para el combustible {fuel_type_id} en la estación.")
    return price


def compute_reading(reading: MeterReading, rate: Decimal, meter_max=None) -> None:
    if reading.final is None:
        reading.liters = reading.amount_usd = reading.amount_ves = ZERO
        return
    try:
        reading.liters = meter_delta(reading.initial, reading.final, meter_max)
    except ValueError as exc:
        raise BusinessRuleError(f"Surtidor {reading.pump.code}: {exc}") from exc
    gross = to_decimal(reading.liters) * to_decimal(reading.price)
    if reading.price_currency == Currency.USD:
        reading.amount_usd = q_money(gross)
        reading.amount_ves = usd_to_ves(reading.amount_usd, rate)
    else:
        reading.amount_ves = q_money(gross)
        reading.amount_usd = ves_to_usd(reading.amount_ves, rate)


# ----------------------------------------------------------------------------- apertura


def ensure_draft(closure: Closure) -> None:
    if closure.status != LockStatus.DRAFT:
        raise InvalidStateError("El cierre ya no está en borrador.")


@transaction.atomic
def open_closure(shift, island: Island, attendant: Attendant | None = None, initials: dict | None = None) -> Closure:
    """Abre la isla: crea el cierre en borrador con las lecturas iniciales de cada surtidor activo."""
    if shift.status != LockStatus.DRAFT:
        raise InvalidStateError("La jornada está cerrada.")
    if island.station_id != shift.station_id:
        raise BusinessRuleError("La isla no pertenece a la estación de la jornada.")
    if attendant and attendant.station_id != shift.station_id:
        raise BusinessRuleError("El bombero no pertenece a la estación de la jornada.")
    if Closure.objects.filter(shift=shift, island=island).exists():
        raise BusinessRuleError("La isla ya fue abierta en esta jornada.")

    pumps = list(island.pumps.filter(is_active=True).select_related("fuel_type"))
    if not pumps:
        raise BusinessRuleError("La isla no tiene surtidores activos.")

    initials = {str(k): v for k, v in (initials or {}).items()}
    closure = Closure.objects.create(
        station_id=shift.station_id, shift=shift, island=island, attendant=attendant, rate=shift.rate
    )
    for pump in pumps:
        expected = last_final_reading(pump)
        initial = initials.get(str(pump.pk), expected)
        if initial is None:
            raise BusinessRuleError(f"Indique la lectura inicial del surtidor {pump.code}.")
        price = current_price(shift.station_id, pump.fuel_type_id)
        MeterReading.objects.create(
            closure=closure,
            pump=pump,
            initial=initial,
            expected_initial=expected,
            price=price.price,
            price_currency=price.currency,
        )
    audit.record("open", closure, after=audit.snapshot(closure))
    return closure


# ----------------------------------------------------------------------------- borrador


def _build_line(closure: Closure, data: dict) -> ClosureLine:
    method = data.get("method")
    line = ClosureLine(closure=closure, method=method, reference=data.get("reference", "") or "")
    if method in CASH_METHOD_CURRENCY:
        denomination: Denomination | None = data.get("denomination")
        quantity = data.get("quantity")
        if denomination is None or quantity is None:
            raise BusinessRuleError("El efectivo se registra por denominación y cantidad.")
        if denomination.currency != CASH_METHOD_CURRENCY[method]:
            raise BusinessRuleError(f"La denominación {denomination} no corresponde a {method}.")
        line.denomination = denomination
        line.quantity = int(quantity)
        line.currency = denomination.currency
        line.amount = q_money(to_decimal(denomination.value) * line.quantity)
    elif method in TERMINAL_METHODS:
        terminal: PaymentTerminal | None = data.get("terminal")
        if terminal is None:
            raise BusinessRuleError("Indique el punto de venta o BioPago.")
        if terminal.kind != TERMINAL_METHODS[method] or terminal.station_id != closure.station_id:
            raise BusinessRuleError(f"El terminal {terminal.code} no es válido para {method}.")
        line.terminal = terminal
        line.currency = terminal.currency
        line.amount = q_money(data.get("amount"))
    else:
        raise BusinessRuleError(f"Medio de pago desconocido: {method}")
    if line.amount < 0:
        raise BusinessRuleError("Los montos no pueden ser negativos.")
    return line


@transaction.atomic
def save_draft(closure: Closure, *, readings=None, lines=None, attendant=..., notes=None) -> Closure:
    """Actualiza lecturas y arqueo del borrador. `lines` reemplaza por completo el arqueo."""
    closure = Closure.objects.select_for_update().get(pk=closure.pk)
    ensure_draft(closure)
    before = audit.snapshot(closure)

    if attendant is not ...:
        if attendant and attendant.station_id != closure.station_id:
            raise BusinessRuleError("El bombero no pertenece a la estación.")
        closure.attendant = attendant
    if notes is not None:
        closure.notes = notes

    if readings is not None:
        by_pump = {r.pump_id: r for r in closure.readings.select_related("pump")}
        for item in readings:
            pump = item["pump"]
            reading = by_pump.get(pump.pk)
            if reading is None:
                raise BusinessRuleError(f"El surtidor {pump.code} no pertenece a este cierre.")
            if "initial" in item and item["initial"] is not None:
                reading.initial = item["initial"]
            if "final" in item:
                reading.final = item["final"]
            compute_reading(reading, closure.rate, pump.meter_max)
            reading.save()

    if lines is not None:
        closure.lines.all().delete()
        ClosureLine.objects.bulk_create([_build_line(closure, data) for data in lines])

    recalculate(closure)
    audit.record("update", closure, before=before, after=audit.snapshot(closure))
    return closure


def recalculate(closure: Closure) -> Closure:
    readings = list(closure.readings.select_related("pump"))
    for reading in readings:
        compute_reading(reading, closure.rate, reading.pump.meter_max)
    MeterReading.objects.bulk_update(readings, ["liters", "amount_usd", "amount_ves"])

    closure.expected_liters = sum((r.liters for r in readings), ZERO)
    closure.expected_usd = q_money(sum((r.amount_usd for r in readings), ZERO))
    closure.expected_ves = q_money(sum((r.amount_ves for r in readings), ZERO))

    lines = list(closure.lines.all())
    closure.declared_usd = q_money(sum((to_usd(line.amount, line.currency, closure.rate) for line in lines), ZERO))
    closure.declared_ves = q_money(sum((to_ves(line.amount, line.currency, closure.rate) for line in lines), ZERO))

    closure.diff_usd = q_money(closure.declared_usd - closure.expected_usd)
    closure.diff_ves = q_money(closure.declared_ves - closure.expected_ves)
    avg_price_usd = closure.expected_usd / closure.expected_liters if closure.expected_liters else ZERO
    closure.diff_liters = liters_from_usd(closure.diff_usd, avg_price_usd)
    if closure.diff_usd > 0:
        closure.result = Closure.Result.OVER
    elif closure.diff_usd < 0:
        closure.result = Closure.Result.SHORT
    else:
        closure.result = Closure.Result.EXACT
    closure.save()
    return closure


def method_totals(closure: Closure) -> list[dict]:
    totals: dict[str, dict] = {}
    for line in closure.lines.all():
        bucket = totals.setdefault(
            line.method,
            {"method": line.method, "currency": line.currency, "amount": ZERO, "amount_usd": ZERO, "amount_ves": ZERO},
        )
        bucket["amount"] += line.amount
        bucket["amount_usd"] += to_usd(line.amount, line.currency, closure.rate)
        bucket["amount_ves"] += to_ves(line.amount, line.currency, closure.rate)
    return list(totals.values())


# ----------------------------------------------------------------------------- estados


@transaction.atomic
def submit(closure: Closure, user) -> Closure:
    closure = Closure.objects.select_for_update().get(pk=closure.pk)
    ensure_draft(closure)
    missing = [r.pump.code for r in closure.readings.select_related("pump") if r.final is None]
    if missing:
        raise BusinessRuleError(f"Faltan lecturas finales: {', '.join(missing)}")
    recalculate(closure)
    before = audit.snapshot(closure)
    closure.status = LockStatus.SUBMITTED
    closure.submitted_at = timezone.now()
    closure.submitted_by = user
    closure.save()
    audit.record("submit", closure, before=before, after=audit.snapshot(closure))
    return closure


@transaction.atomic
def reopen(closure: Closure, user, reason: str) -> Closure:
    closure = Closure.objects.select_for_update().get(pk=closure.pk)
    if closure.status != LockStatus.SUBMITTED:
        raise InvalidStateError("Solo se pueden devolver cierres enviados.")
    if not reason.strip():
        raise BusinessRuleError("Indique el motivo.")
    before = audit.snapshot(closure)
    closure.status = LockStatus.DRAFT
    closure.submitted_at = None
    closure.submitted_by = None
    closure.save()
    audit.record("reopen", closure, before=before, after={**audit.snapshot(closure), "reason": reason})
    return closure


def build_snapshot(closure: Closure) -> dict:
    """Representación canónica de todo lo que el hash protege."""
    return {
        "id": str(closure.pk),
        "station": str(closure.station_id),
        "shift": str(closure.shift_id),
        "shift_date": closure.shift.date.isoformat(),
        "island": str(closure.island_id),
        "attendant": str(closure.attendant_id) if closure.attendant_id else None,
        "rate": closure.rate,
        "chain_seq": closure.chain_seq,
        "totals": {
            field: getattr(closure, field)
            for field in (
                "expected_liters",
                "expected_usd",
                "expected_ves",
                "declared_usd",
                "declared_ves",
                "diff_usd",
                "diff_ves",
                "diff_liters",
                "result",
            )
        },
        "readings": [
            {
                "pump": str(r.pump_id),
                "initial": r.initial,
                "final": r.final,
                "price": r.price,
                "price_currency": r.price_currency,
                "liters": r.liters,
                "amount_usd": r.amount_usd,
                "amount_ves": r.amount_ves,
            }
            for r in closure.readings.order_by("pump_id")
        ],
        "lines": [
            {
                "method": line.method,
                "denomination": str(line.denomination_id) if line.denomination_id else None,
                "terminal": str(line.terminal_id) if line.terminal_id else None,
                "quantity": line.quantity,
                "amount": line.amount,
                "currency": line.currency,
                "reference": line.reference,
            }
            for line in closure.lines.order_by("method", "denomination_id", "terminal_id", "amount", "reference")
        ],
        "notes": closure.notes,
        "submitted_by": closure.submitted_by_id,
        "locked_by": closure.locked_by_id,
    }


@transaction.atomic
def lock(closure: Closure, user) -> Closure:
    """Bloquea el cierre de forma permanente y lo encadena por HMAC al anterior de la estación."""
    Station.objects.select_for_update().get(pk=closure.station_id)  # serializa la cadena por estación
    closure = Closure.objects.select_for_update().select_related("shift").get(pk=closure.pk)
    if closure.status != LockStatus.SUBMITTED:
        raise InvalidStateError("Solo se pueden bloquear cierres enviados.")

    recalculate(closure)
    last = Closure.objects.filter(station_id=closure.station_id, status=LockStatus.LOCKED).aggregate(
        seq=Max("chain_seq")
    )["seq"]
    prev = Closure.objects.filter(station_id=closure.station_id, chain_seq=last).first() if last else None
    prev_hash = prev.content_hash if prev else hashing.GENESIS

    closure.chain_seq = (last or 0) + 1
    closure.locked_by_id = user.pk
    content_hash = hashing.chain_hash(prev_hash, build_snapshot(closure))
    closure.mark_locked(user.pk, prev_hash, content_hash)

    MeterReading.objects.filter(closure=closure).update(is_locked=True)
    ClosureLine.objects.filter(closure=closure).update(is_locked=True)
    closure.save()
    audit.record("lock", closure, after=audit.snapshot(closure))
    return closure


def verify_chain(station_id) -> dict:
    """Recalcula la cadena completa de la estación y reporta el primer eslabón roto."""
    prev_hash = hashing.GENESIS
    checked = 0
    closures = (
        Closure.objects.filter(station_id=station_id, status=LockStatus.LOCKED)
        .select_related("shift")
        .order_by("chain_seq")
    )
    for expected_seq, closure in enumerate(closures, start=1):
        checked += 1
        problem = None
        if closure.chain_seq != expected_seq:
            problem = "secuencia interrumpida"
        elif closure.prev_hash != prev_hash:
            problem = "enlace con el cierre anterior alterado"
        elif not hashing.verify(prev_hash, build_snapshot(closure), closure.content_hash):
            problem = "contenido alterado"
        if problem:
            return {
                "valid": False,
                "checked": checked,
                "broken_at": str(closure.pk),
                "chain_seq": closure.chain_seq,
                "problem": problem,
            }
        prev_hash = closure.content_hash
    return {"valid": True, "checked": checked, "broken_at": None, "chain_seq": None, "problem": None, "head": prev_hash}
