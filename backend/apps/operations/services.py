from django.db import transaction

from apps.audit import services as audit
from apps.core import hashing
from apps.core.exceptions import BusinessRuleError, InvalidStateError
from apps.core.models import LockStatus
from apps.rates.models import ExchangeRate

from .models import Shift


def resolve_rate(date, manual_rate, user):
    """La tasa de la jornada es la del BCV vigente; una tasa manual exige permiso explícito."""
    reference = ExchangeRate.objects.current(date)
    if manual_rate is not None:
        if reference is None or manual_rate != reference.rate:
            if not user.has_perm("rates.override_rate"):
                raise BusinessRuleError("No tiene permiso para usar una tasa distinta a la oficial.")
        return manual_rate, reference
    if reference is None:
        raise BusinessRuleError("No hay tasa BCV registrada. Consulte el BCV o registre la tasa manualmente.")
    return reference.rate, reference


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
