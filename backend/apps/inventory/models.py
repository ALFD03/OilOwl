from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.exceptions import ImmutableRecordError
from apps.core.models import StationCatalogModel, StationScopedModel
from apps.core.money import LITERS_FIELD, MONEY_FIELD, PERCENT_FIELD, PRICE_FIELD, RATE_FIELD


class Tank(StationCatalogModel):
    """Tanque de almacenamiento con su tolerancia de diferencia aceptable."""

    fuel_type = models.ForeignKey(
        "catalog.FuelType", on_delete=models.PROTECT, related_name="tanks", verbose_name="combustible"
    )
    capacity = models.DecimalField("capacidad (L)", validators=[MinValueValidator(0)], **LITERS_FIELD)
    tolerance_pct = models.DecimalField(
        "tolerancia (%)", default=0.5, validators=[MinValueValidator(0)], **PERCENT_FIELD
    )

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_tank_code")]


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
    """Medición física del tanque (varilla o sonda)."""

    class Method(models.TextChoices):
        STICK = "STICK", "Varilla"
        PROBE = "PROBE", "Sonda"
        MANUAL = "MANUAL", "Manual"

    tank = models.ForeignKey(Tank, on_delete=models.PROTECT, related_name="readings")
    measured_at = models.DateTimeField("fecha de medición", default=timezone.now)
    liters = models.DecimalField("litros", validators=[MinValueValidator(0)], **LITERS_FIELD)
    height_cm = models.DecimalField("altura (cm)", null=True, blank=True, max_digits=8, decimal_places=2)
    method = models.CharField(max_length=8, choices=Method.choices, default=Method.STICK)
    notes = models.CharField(max_length=255, blank=True)

    class Meta(AppendOnlyModel.Meta):
        ordering = ["-measured_at"]


class Delivery(AppendOnlyModel):
    """Descarga de cisterna."""

    tank = models.ForeignKey(Tank, on_delete=models.PROTECT, related_name="deliveries")
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
