from django.db import transaction

from apps.audit import services as audit
from apps.core import hashing
from apps.core.exceptions import BusinessRuleError, InvalidStateError
from apps.core.models import LockStatus
from apps.core.money import MIN_RATE
from apps.rates.models import ExchangeRate

from .models import Shift


def resolve_rate(date, manual_rate, user):
    """La tasa de la jornada es la del BCV vigente; una tasa manual exige permiso explícito."""
    reference = ExchangeRate.objects.current(date)
    if manual_rate is not None:
        if manual_rate < MIN_RATE:
            raise BusinessRuleError("La tasa debe ser mayor que cero.")
        if reference is None or manual_rate != reference.rate:
            if not user.has_perm("rates.override_rate"):
                raise BusinessRuleError("No tiene permiso para usar una tasa distinta a la oficial.")
        return manual_rate, reference
    if reference is None or reference.rate < MIN_RATE:
        raise BusinessRuleError("No hay tasa BCV válida registrada. Consulte el BCV o registre la tasa manualmente.")
    return reference.rate, reference


@transaction.atomic
def set_shift_rate(shift: Shift, manual_rate, user) -> Shift:
    """Corrige la tasa de una jornada abierta y recalcula sus cierres en borrador.

    Solo se permite mientras todos los cierres estén en borrador: un cierre enviado o
    bloqueado ya fue validado con la tasa anterior.
    """
    from apps.closures.services import recalculate

    shift = Shift.objects.select_for_update().get(pk=shift.pk)
    if shift.status != LockStatus.DRAFT:
        raise InvalidStateError("La jornada ya está cerrada.")
    not_draft = shift.closures.exclude(status=LockStatus.DRAFT).count()
    if not_draft:
        raise BusinessRuleError(
            f"Hay {not_draft} cierre(s) enviados o bloqueados con la tasa actual. Devuelva los enviados a borrador para cambiarla."
        )
    rate, reference = resolve_rate(shift.date, manual_rate, user)
    before = audit.snapshot(shift)
    shift.rate = rate
    shift.exchange_rate = reference
    shift.save(update_fields=["rate", "exchange_rate", "updated_at", "updated_by"])
    for closure in shift.closures.all():
        closure.rate = rate
        recalculate(closure)
    audit.record("set_rate", shift, before=before, after=audit.snapshot(shift))
    return shift


def shift_snapshot(shift: Shift) -> dict:
    closures = shift.closures.order_by("chain_seq").values_list("content_hash", flat=True)
    return {
        "id": str(shift.pk),
        "station": str(shift.station_id),
        "date": shift.date.isoformat(),
        "template": str(shift.shift_template_id) if shift.shift_template_id else None,
        "rate": shift.rate,
        "closures": list(closures),
    }


@transaction.atomic
def close_shift(shift: Shift, user) -> Shift:
    """Cierra la jornada cuando todas sus islas están bloqueadas y concilia los tanques."""
    from apps.inventory.services import reconcile_pending_tanks

    shift = Shift.objects.select_for_update().get(pk=shift.pk)
    if shift.status != LockStatus.DRAFT:
        raise InvalidStateError("La jornada ya está cerrada.")
    closures = shift.closures.all()
    if not closures.exists():
        raise BusinessRuleError("La jornada no tiene cierres de isla.")
    pending = closures.exclude(status=LockStatus.LOCKED).count()
    if pending:
        raise BusinessRuleError(f"Hay {pending} cierre(s) de isla sin bloquear.")

    reconciliations = reconcile_pending_tanks(shift)
    shift.mark_locked(user.pk, "", hashing.chain_hash(hashing.GENESIS, shift_snapshot(shift)))
    shift.save()
    audit.record(
        "lock", shift, after={**audit.snapshot(shift), "reconciliations": [str(r.pk) for r in reconciliations]}
    )
    return shift
