from django.core.validators import MinValueValidator
from django.db import models

from apps.core.choices import Currency
from apps.core.exceptions import ImmutableRecordError
from apps.core.models import BaseModel, LockableModel
from apps.core.money import LITERS_FIELD, MONEY_FIELD, PRICE_FIELD, RATE_FIELD


class Closure(LockableModel):
    """Cierre de caja de una isla dentro de una jornada."""

    class Result(models.TextChoices):
        EXACT = "EXACT", "Cuadrado"
        OVER = "OVER", "Sobrante"
        SHORT = "SHORT", "Faltante"

    station = models.ForeignKey(
        "catalog.Station", on_delete=models.PROTECT, related_name="closures", verbose_name="estación"
    )
    shift = models.ForeignKey(
        "operations.Shift", on_delete=models.PROTECT, related_name="closures", verbose_name="jornada"
    )
    island = models.ForeignKey("catalog.Island", on_delete=models.PROTECT, related_name="closures", verbose_name="isla")
    attendant = models.ForeignKey(
        "catalog.Attendant",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="closures",
        verbose_name="bombero",
    )
    rate = models.DecimalField("tasa Bs/USD", **RATE_FIELD)

    expected_liters = models.DecimalField(default=0, **LITERS_FIELD)
    expected_usd = models.DecimalField(default=0, **MONEY_FIELD)
    expected_ves = models.DecimalField(default=0, **MONEY_FIELD)
    declared_usd = models.DecimalField(default=0, **MONEY_FIELD)
    declared_ves = models.DecimalField(default=0, **MONEY_FIELD)
    diff_usd = models.DecimalField(default=0, **MONEY_FIELD)
    diff_ves = models.DecimalField(default=0, **MONEY_FIELD)
    diff_liters = models.DecimalField(default=0, **LITERS_FIELD)
    result = models.CharField(max_length=5, choices=Result.choices, default=Result.EXACT)

    notes = models.CharField("observaciones", max_length=1000, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True, editable=False)
    submitted_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, editable=False, on_delete=models.PROTECT, related_name="+"
    )
    chain_seq = models.PositiveIntegerField(null=True, blank=True, editable=False)

    class Meta(LockableModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["shift", "island"], name="uniq_closure_island_shift"),
            models.UniqueConstraint(fields=["station", "chain_seq"], name="uniq_closure_chain_seq"),
        ]
        permissions = [
            ("submit_closure", "Puede enviar cierres a revisión"),
            ("reopen_closure", "Puede devolver cierres enviados a borrador"),
            ("lock_closure", "Puede bloquear cierres (inalterables)"),
            ("verify_chain", "Puede verificar la integridad de los cierres"),
        ]

    def __str__(self):
        return f"Cierre {self.shift_id} · isla {self.island_id}"


class ClosureChildModel(BaseModel):
    """Hijo de un cierre: se bloquea junto con él (y la BD lo refuerza con triggers)."""

    is_locked = models.BooleanField(default=False, editable=False)

    class Meta(BaseModel.Meta):
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding and type(self).objects.filter(pk=self.pk, is_locked=True).exists():
            raise ImmutableRecordError()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_locked:
            raise ImmutableRecordError()
        return super().delete(*args, **kwargs)


class MeterReading(ClosureChildModel):
    """Lectura inicial y final del totalizador de un surtidor, con el precio congelado."""

    closure = models.ForeignKey(Closure, on_delete=models.CASCADE, related_name="readings")
    pump = models.ForeignKey("catalog.Pump", on_delete=models.PROTECT, related_name="readings", verbose_name="surtidor")
    initial = models.DecimalField("lectura inicial", validators=[MinValueValidator(0)], **LITERS_FIELD)
    final = models.DecimalField(
        "lectura final", null=True, blank=True, validators=[MinValueValidator(0)], **LITERS_FIELD
    )
    expected_initial = models.DecimalField(null=True, blank=True, editable=False, **LITERS_FIELD)
    price = models.DecimalField("precio", **PRICE_FIELD)
    price_currency = models.CharField(max_length=3, choices=Currency.choices)
    liters = models.DecimalField(default=0, **LITERS_FIELD)
    amount_usd = models.DecimalField(default=0, **MONEY_FIELD)
    amount_ves = models.DecimalField(default=0, **MONEY_FIELD)

    class Meta(ClosureChildModel.Meta):
        ordering = ["pump__code"]
        constraints = [models.UniqueConstraint(fields=["closure", "pump"], name="uniq_reading_pump")]
        default_permissions = ()

    @property
    def has_gap(self) -> bool:
        return self.expected_initial is not None and self.expected_initial != self.initial


class PaymentMethod(models.TextChoices):
    CASH_VES = "CASH_VES", "Efectivo Bs"
    CASH_USD = "CASH_USD", "Efectivo $"
    POS = "POS", "Punto de venta"
    BIOPAGO = "BIOPAGO", "BioPago"


CASH_METHOD_CURRENCY = {PaymentMethod.CASH_VES: Currency.VES, PaymentMethod.CASH_USD: Currency.USD}


class ClosureLine(ClosureChildModel):
    """Línea genérica del arqueo: billetes por denominación o monto por terminal."""

    closure = models.ForeignKey(Closure, on_delete=models.CASCADE, related_name="lines")
    method = models.CharField("medio", max_length=10, choices=PaymentMethod.choices)
    denomination = models.ForeignKey(
        "catalog.Denomination", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    terminal = models.ForeignKey(
        "catalog.PaymentTerminal", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    quantity = models.PositiveIntegerField("cantidad", null=True, blank=True)
    amount = models.DecimalField("monto", validators=[MinValueValidator(0)], **MONEY_FIELD)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    reference = models.CharField("referencia/lote", max_length=60, blank=True)

    class Meta(ClosureChildModel.Meta):
        ordering = ["method", "-amount"]
        default_permissions = ()


class ClosureAdjustment(BaseModel):
    """Corrección posterior de un cierre bloqueado. Solo se agrega; nunca se edita."""

    closure = models.ForeignKey(Closure, on_delete=models.PROTECT, related_name="adjustments")
    reason = models.CharField("motivo", max_length=500)
    amount_usd = models.DecimalField(default=0, **MONEY_FIELD)
    amount_ves = models.DecimalField(default=0, **MONEY_FIELD)
    liters = models.DecimalField(default=0, **LITERS_FIELD)

    class Meta(BaseModel.Meta):
        default_permissions = ("add", "view")

    @property
    def station_id(self):
        return self.closure.station_id

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableRecordError()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableRecordError()
