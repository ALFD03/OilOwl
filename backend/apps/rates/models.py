from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel
from apps.core.money import MIN_RATE, RATE_FIELD


class ExchangeRateQuerySet(models.QuerySet):
    def current(self, at=None):
        """Tasa vigente: la más reciente con fecha valor <= at."""
        at = at or timezone.localdate()
        return self.filter(valid_date__lte=at).order_by("-valid_date", "-created_at").first()


class ExchangeRate(BaseModel):
    """Tasa oficial Bs/USD. Histórica e inmutable: correcciones = nuevo registro manual."""

    class Source(models.TextChoices):
        BCV = "BCV", "BCV automático"
        MANUAL = "MANUAL", "Manual"

    valid_date = models.DateField("fecha valor", db_index=True)
    rate = models.DecimalField("Bs por USD", validators=[MinValueValidator(MIN_RATE)], **RATE_FIELD)
    source = models.CharField(max_length=8, choices=Source.choices, default=Source.BCV)
    notes = models.CharField(max_length=255, blank=True)

    objects = ExchangeRateQuerySet.as_manager()

    class Meta(BaseModel.Meta):
        ordering = ["-valid_date", "-created_at"]
        default_permissions = ("view",)
        permissions = [
            ("fetch_rate", "Puede consultar la tasa del BCV"),
            ("override_rate", "Puede registrar la tasa manualmente"),
        ]

    def __str__(self):
        return f"{self.valid_date} {self.rate} ({self.source})"
