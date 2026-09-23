"""Agregados para el dashboard. Solo consideran cierres bloqueados (cifras definitivas)."""

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate

from apps.closures.models import Closure, ClosureLine, MeterReading
from apps.core.choices import Currency
from apps.core.models import LockStatus
from apps.core.money import ZERO, q_money
from apps.inventory.models import Reconciliation


def closures(station_ids, date_from, date_to):
    qs = Closure.objects.filter(status=LockStatus.LOCKED, shift__date__gte=date_from, shift__date__lte=date_to)
    return qs if station_ids is None else qs.filter(station_id__in=station_ids)


def summary(station_ids, date_from, date_to) -> dict:
    agg = closures(station_ids, date_from, date_to).aggregate(
        closures=Count("id"),
        liters=Sum("expected_liters"),
        sales_usd=Sum("expected_usd"),
        sales_ves=Sum("expected_ves"),
        declared_usd=Sum("declared_usd"),
        declared_ves=Sum("declared_ves"),
        diff_usd=Sum("diff_usd"),
        diff_ves=Sum("diff_ves"),
        diff_liters=Sum("diff_liters"),
        over=Count("id", filter=Q(result=Closure.Result.OVER)),
        short=Count("id", filter=Q(result=Closure.Result.SHORT)),
    )
    shrink = shrinkage_qs(station_ids, date_from, date_to).aggregate(
        liters=Sum("variance_liters"),
        usd=Sum("variance_usd"),
        ves=Sum("variance_ves"),
        out=Count("id", filter=Q(within_tolerance=False)),
    )
    return {
        **{k: (v if v is not None else ZERO) for k, v in agg.items()},
        "shrinkage_liters": shrink["liters"] or ZERO,
        "shrinkage_usd": shrink["usd"] or ZERO,
        "shrinkage_ves": shrink["ves"] or ZERO,
        "reconciliations_out_of_tolerance": shrink["out"],
    }


def sales_by_day(station_ids, date_from, date_to) -> list[dict]:
    return list(
        closures(station_ids, date_from, date_to)
        .values(date=TruncDate("shift__date"))
        .annotate(
            liters=Sum("expected_liters"), usd=Sum("expected_usd"), ves=Sum("expected_ves"), diff_usd=Sum("diff_usd")
        )
        .order_by("date")
    )


def liters_by_fuel(station_ids, date_from, date_to) -> list[dict]:
    readings = MeterReading.objects.filter(closure__in=closures(station_ids, date_from, date_to))
    return list(
        readings.values(
            date=TruncDate("closure__shift__date"), fuel=F("pump__fuel_type__name"), color=F("pump__fuel_type__color")
        )
        .annotate(liters=Sum("liters"), usd=Sum("amount_usd"))
        .order_by("date", "fuel")
    )


def differences(station_ids, date_from, date_to) -> dict:
    base = closures(station_ids, date_from, date_to)
    fields = dict(
        closures=Count("id"),
        diff_usd=Sum("diff_usd"),
        diff_ves=Sum("diff_ves"),
        diff_liters=Sum("diff_liters"),
        over=Count("id", filter=Q(result=Closure.Result.OVER)),
        short=Count("id", filter=Q(result=Closure.Result.SHORT)),
    )
    return {
        "by_attendant": list(base.values("attendant", "attendant__name").annotate(**fields).order_by("diff_usd")),
        "by_island": list(base.values("island", "island__name").annotate(**fields).order_by("diff_usd")),
    }


def payment_methods(station_ids, date_from, date_to) -> list[dict]:
    lines = ClosureLine.objects.filter(closure__in=closures(station_ids, date_from, date_to)).select_related("closure")
    totals: dict[str, dict] = {}
    for line in lines.iterator():
        bucket = totals.setdefault(line.method, {"method": line.method, "amount_usd": ZERO, "amount_ves": ZERO})
        rate = line.closure.rate
        if line.currency == Currency.USD:
            bucket["amount_usd"] += line.amount
            bucket["amount_ves"] += q_money(line.amount * rate)
        else:
            bucket["amount_ves"] += line.amount
            bucket["amount_usd"] += q_money(line.amount / rate) if rate else ZERO
    return list(totals.values())


def shrinkage_qs(station_ids, date_from, date_to):
    qs = Reconciliation.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
    return qs if station_ids is None else qs.filter(station_id__in=station_ids)


def shrinkage(station_ids, date_from, date_to) -> list[dict]:
    return list(
        shrinkage_qs(station_ids, date_from, date_to)
        .values("tank", "tank__name")
        .annotate(
            reconciliations=Count("id"),
            variance_liters=Sum("variance_liters"),
            variance_usd=Sum("variance_usd"),
            variance_ves=Sum("variance_ves"),
            out_of_tolerance=Count("id", filter=Q(within_tolerance=False)),
        )
        .order_by("variance_liters")
    )
