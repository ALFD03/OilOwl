from django.core.exceptions import ValidationError
from django.db import models

from apps.core import codes
from apps.core.models import BaseModel, StationCatalogModel


class ShiftTemplate(codes.AutoCodeMixin, StationCatalogModel):
    """Turno de trabajo (p. ej. Mañana 06:00-14:00)."""

    start_time = models.TimeField("inicio")
    end_time = models.TimeField("fin")

    class Meta(StationCatalogModel.Meta):
        constraints = [models.UniqueConstraint(fields=["station", "code"], name="uniq_shifttemplate_code")]

    def code_prefix(self):
        return codes.SHIFT_TEMPLATE

    @property
    def crosses_midnight(self) -> bool:
        return self.end_time <= self.start_time


class Assignment(BaseModel):
    """Asignación de un bombero a una isla en un día y turno."""

    date = models.DateField("fecha", db_index=True)
    shift_template = models.ForeignKey(
        ShiftTemplate, on_delete=models.PROTECT, related_name="assignments", verbose_name="turno"
    )
    island = models.ForeignKey(
        "catalog.Island", on_delete=models.PROTECT, related_name="assignments", verbose_name="isla"
    )
    attendant = models.ForeignKey(
        "catalog.Attendant", on_delete=models.PROTECT, related_name="assignments", verbose_name="bombero"
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["date", "shift_template__start_time"]
        constraints = [
            models.UniqueConstraint(fields=["date", "shift_template", "attendant"], name="uniq_attendant_per_shift"),
        ]

    @property
    def station_id(self):
        return self.shift_template.station_id

    def clean(self):
        station_ids = {self.shift_template.station_id, self.island.station_id, self.attendant.station_id}
        if len(station_ids) != 1:
            raise ValidationError("Turno, isla y bombero deben pertenecer a la misma estación.")
