from django.db import models

from apps.core.models import LockableModel
from apps.core.money import RATE_FIELD


class Shift(LockableModel):
    """Jornada de trabajo de una estación. Congela la tasa de cambio que usarán sus cierres."""

    station = models.ForeignKey(
        "catalog.Station", on_delete=models.PROTECT, related_name="shifts", verbose_name="estación"
    )
    date = models.DateField("fecha", db_index=True)
    shift_template = models.ForeignKey(
        "scheduling.ShiftTemplate",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="shifts",
        verbose_name="turno",
    )
    rate = models.DecimalField("tasa Bs/USD", **RATE_FIELD)
    exchange_rate = models.ForeignKey(
        "rates.ExchangeRate",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="shifts",
        verbose_name="tasa de referencia",
    )
    notes = models.CharField("observaciones", max_length=500, blank=True)

    class Meta(LockableModel.Meta):
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["station", "date", "shift_template"], name="uniq_shift_per_day"),
            models.UniqueConstraint(
                fields=["station", "date"],
                condition=models.Q(shift_template__isnull=True),
                name="uniq_shift_day_no_template",
            ),
        ]
        permissions = [("close_shift", "Puede cerrar jornadas")]

    def __str__(self):
        return f"Jornada {self.date} · {self.station_id}"
