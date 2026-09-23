from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.choices import Currency
from apps.core.crypto import EncryptedTextField, blind_index
from apps.core.models import BaseModel, CatalogModel, StationCatalogModel, StationScopedModel
from apps.core.money import LITERS_FIELD, PRICE_FIELD


class Station(CatalogModel):
    """Estación de servicio."""

    rif = models.CharField("RIF", max_length=20, blank=True)
    address = models.CharField("dirección", max_length=255, blank=True)
    phone = models.CharField("teléfono", max_length=30, blank=True)

    class Meta(CatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["code"], name="uniq_station_code")]


class FuelType(CatalogModel):
    """Tipo de combustible (Gasolina 91, 95, Gasoil...)."""

    color = models.CharField(max_length=7, default="#64748b")

    class Meta(CatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["code"], name="uniq_fueltype_code")]


class Island(StationCatalogModel):
    """Isla de despacho."""

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_island_code")]


class Pump(CatalogModel):
    """Surtidor/manguera con su totalizador de litros."""

    island = models.ForeignKey(Island, on_delete=models.PROTECT, related_name="pumps", verbose_name="isla")
    fuel_type = models.ForeignKey(FuelType, on_delete=models.PROTECT, related_name="pumps", verbose_name="combustible")
    tank = models.ForeignKey(
        "inventory.Tank", null=True, blank=True, on_delete=models.PROTECT, related_name="pumps", verbose_name="tanque"
    )
    meter_max = models.DecimalField(
        "tope del totalizador", null=True, blank=True, validators=[MinValueValidator(0)], **LITERS_FIELD
    )

    class Meta(CatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["island", "code"], name="uniq_pump_code")]

    @property
    def station_id(self):
        return self.island.station_id


class FuelPriceQuerySet(models.QuerySet):
    def current(self, station_id, fuel_type_id, at=None):
        at = at or timezone.now()
        return (
            self.filter(station_id=station_id, fuel_type_id=fuel_type_id, valid_from__lte=at)
            .order_by("-valid_from")
            .first()
        )


class FuelPrice(StationScopedModel):
    """Precio histórico por estación y combustible. Nunca se edita: se registra uno nuevo."""

    fuel_type = models.ForeignKey(FuelType, on_delete=models.PROTECT, related_name="prices", verbose_name="combustible")
    price = models.DecimalField("precio por litro", validators=[MinValueValidator(0)], **PRICE_FIELD)
    currency = models.CharField("moneda", max_length=3, choices=Currency.choices, default=Currency.USD)
    valid_from = models.DateTimeField("vigente desde", default=timezone.now)

    objects = FuelPriceQuerySet.as_manager()

    class Meta(StationScopedModel.Meta):
        ordering = ["-valid_from"]
        constraints = [
            models.UniqueConstraint(fields=["station", "fuel_type", "valid_from"], name="uniq_fuelprice_validity")
        ]
        default_permissions = ("add", "view")

    def __str__(self):
        return f"{self.fuel_type_id} {self.price} {self.currency} desde {self.valid_from:%Y-%m-%d}"


class Denomination(BaseModel):
    """Denominación de billete o moneda para el arqueo de efectivo."""

    class Kind(models.TextChoices):
        BILL = "BILL", "Billete"
        COIN = "COIN", "Moneda"

    currency = models.CharField("moneda", max_length=3, choices=Currency.choices)
    value = models.DecimalField("valor", max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    kind = models.CharField("tipo", max_length=4, choices=Kind.choices, default=Kind.BILL)
    is_active = models.BooleanField("activo", default=True)

    class Meta(BaseModel.Meta):
        ordering = ["currency", "-value"]
        constraints = [models.UniqueConstraint(fields=["currency", "value", "kind"], name="uniq_denomination")]

    def __str__(self):
        return f"{self.value} {self.currency}"


class PaymentTerminal(StationCatalogModel):
    """Punto de venta bancario o dispositivo BioPago."""

    class Kind(models.TextChoices):
        POS = "POS", "Punto de venta"
        BIOPAGO = "BIOPAGO", "BioPago"

    kind = models.CharField("tipo", max_length=8, choices=Kind.choices)
    bank = models.CharField("banco", max_length=80, blank=True)
    serial = models.CharField("serial", max_length=80, blank=True)
    currency = models.CharField("moneda", max_length=3, choices=Currency.choices, default=Currency.VES)

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_terminal_code")]


class Attendant(StationCatalogModel):
    """Bombero. Sus datos personales se guardan cifrados."""

    national_id = EncryptedTextField("cédula", blank=True)
    national_id_index = models.CharField(max_length=64, blank=True, editable=False, db_index=True)
    phone = EncryptedTextField("teléfono", blank=True)

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_attendant_code")]

    def save(self, *args, **kwargs):
        self.national_id_index = blind_index(self.national_id) if self.national_id else ""
        super().save(*args, **kwargs)
