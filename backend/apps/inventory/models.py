from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core import codes
from apps.core.exceptions import ImmutableRecordError
from apps.core.models import StationCatalogModel, StationScopedModel
from apps.core.money import LITERS_FIELD, MONEY_FIELD, PERCENT_FIELD, PRICE_FIELD, RATE_FIELD


class Tank(codes.AutoCodeMixin, StationCatalogModel):
    """Tanque de almacenamiento con su tolerancia de diferencia aceptable."""

    fuel_type = models.ForeignKey(
        "catalog.FuelType", on_delete=models.PROTECT, related_name="tanks", verbose_name="combustible"
    )
    capacity = models.DecimalField("capacidad (L)", validators=[MinValueValidator(0)], **LITERS_FIELD)
    tolerance_pct = models.DecimalField(
        "tolerancia (%)", default=0.5, validators=[MinValueValidator(0)], **PERCENT_FIELD
    )
    # Tabla de aforo: [{"cm": "0.00", "liters": "0.000"}, ...] ordenada por altura.
    # Los litros de cada medición se interpolan linealmente entre sus puntos (ver calibration.py).
    calibration = models.JSONField("tabla de aforo", default=list, blank=True)

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_tank_code")]

    def code_prefix(self):
        return codes.TANK


class AppendOnlyModel(StationScopedModel):
    """Registro de inventario inmutable desde su creación."""

    class Meta(StationScopedModel.Meta):
        abstract = True
        default_permissions = ("add", "view")

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableRecordError()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableRecordError()


class TankReading(AppendOnlyModel):
    """Medición física del tanque en cm; los litros salen de la tabla de aforo."""

    class Method(models.TextChoices):
        STICK = "STICK", "Varilla"
        PROBE = "PROBE", "Sonda"
        MANUAL = "MANUAL", "Manual"

    class Kind(models.TextChoices):
        OPENING = "OPENING", "Apertura de jornada"
        CLOSING = "CLOSING", "Cierre de jornada"
        SPOT = "SPOT", "Puntual"

    tank = models.ForeignKey(Tank, on_delete=models.PROTECT, related_name="readings")
    shift = models.ForeignKey(
        "operations.Shift",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="tank_readings",
        verbose_name="jornada",
    )
    kind = models.CharField("tipo", max_length=8, choices=Kind.choices, default=Kind.SPOT)
    measured_at = models.DateTimeField("fecha de medición", default=timezone.now)
    liters = models.DecimalField("litros", validators=[MinValueValidator(0)], **LITERS_FIELD)
    height_cm = models.DecimalField("altura (cm)", null=True, blank=True, max_digits=8, decimal_places=2)
    method = models.CharField(max_length=8, choices=Method.choices, default=Method.STICK)
    notes = models.CharField(max_length=255, blank=True)

    class Meta(AppendOnlyModel.Meta):
        ordering = ["-measured_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shift", "tank", "kind"],
                condition=models.Q(shift__isnull=False),
                name="uniq_shift_tank_reading",
            )
        ]


class Delivery(AppendOnlyModel):
    """Descarga de cisterna."""

    tank = models.ForeignKey(Tank, on_delete=models.PROTECT, related_name="deliveries")
    shift = models.ForeignKey(
        "operations.Shift",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="deliveries",
        verbose_name="jornada",
    )
    delivered_at = models.DateTimeField("fecha de descarga", default=timezone.now)
    liters = models.DecimalField("litros recibidos", validators=[MinValueValidator(0)], **LITERS_FIELD)
    document = models.CharField("guía/factura", max_length=60, blank=True)
    supplier = models.CharField("proveedor", max_length=120, blank=True)

    class Meta(AppendOnlyModel.Meta):
        ordering = ["-delivered_at"]


class Reconciliation(AppendOnlyModel):
    """Conciliación de un tanque entre dos mediciones: esperado vs. medido, y merma."""

    tank = models.ForeignKey(Tank, on_delete=models.PROTECT, related_name="reconciliations")
    shift = models.ForeignKey(
        "operations.Shift", null=True, blank=True, on_delete=models.PROTECT, related_name="reconciliations"
    )
    opening_reading = models.ForeignKey(TankReading, on_delete=models.PROTECT, related_name="+")
    closing_reading = models.ForeignKey(TankReading, on_delete=models.PROTECT, related_name="+")
    opening_liters = models.DecimalField(**LITERS_FIELD)
    deliveries_liters = models.DecimalField(**LITERS_FIELD)
    sold_liters = models.DecimalField(**LITERS_FIELD)
    expected_liters = models.DecimalField(**LITERS_FIELD)
    measured_liters = models.DecimalField(**LITERS_FIELD)
    variance_liters = models.DecimalField(**LITERS_FIELD)
    variance_pct = models.DecimalField(max_digits=9, decimal_places=4)
    tolerance_pct = models.DecimalField(**PERCENT_FIELD)
    within_tolerance = models.BooleanField()
    price_usd = models.DecimalField(**PRICE_FIELD)
    rate = models.DecimalField(**RATE_FIELD)
    variance_usd = models.DecimalField(**MONEY_FIELD)
    variance_ves = models.DecimalField(**MONEY_FIELD)
    notes = models.CharField(max_length=255, blank=True)

    class Meta(AppendOnlyModel.Meta):
        permissions = [("run_reconciliation", "Puede ejecutar conciliaciones de tanques")]
