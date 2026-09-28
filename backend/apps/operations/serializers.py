from rest_framework import serializers

from apps.core.money import MIN_RATE, RATE_FIELD
from apps.core.serializers import LOCK_READ_ONLY, BaseModelSerializer
from apps.inventory.serializers import TankHeightSerializer

from .models import Shift


class SetRateSerializer(serializers.Serializer):
    """Sin `rate` se aplica la tasa BCV vigente para la fecha de la jornada."""

    rate = serializers.DecimalField(required=False, allow_null=True, min_value=MIN_RATE, **RATE_FIELD)


class CloseShiftSerializer(serializers.Serializer):
    """Medición final (cm) de cada tanque activo de la estación."""

    tank_readings = TankHeightSerializer(many=True, required=False)


class ShiftSerializer(BaseModelSerializer):
    rate = serializers.DecimalField(required=False, allow_null=True, min_value=MIN_RATE, **RATE_FIELD)
    # Medición inicial (cm) de cada tanque activo; solo al abrir la jornada.
    tank_readings = TankHeightSerializer(many=True, required=False, write_only=True)
    closures_total = serializers.IntegerField(read_only=True, source="closures.count")
    shift_name = serializers.CharField(source="shift_template.name", read_only=True, default=None)

    class Meta(BaseModelSerializer.Meta):
        model = Shift
        read_only_fields = BaseModelSerializer.Meta.read_only_fields + LOCK_READ_ONLY + ("exchange_rate",)

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None and not isinstance(self.instance, list):
            for name in ("station", "date", "shift_template", "rate", "tank_readings"):
                fields[name].read_only = True
        return fields
