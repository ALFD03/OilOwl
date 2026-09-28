from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.models import LockStatus
from apps.core.money import LITERS_FIELD
from apps.core.serializers import AUTO_CODE_READ_ONLY, BASE_READ_ONLY, BaseModelSerializer, ImmutableOnUpdateMixin

from . import calibration
from .models import Delivery, Reconciliation, Tank, TankReading

HEIGHT_FIELD = {"max_digits": 8, "decimal_places": 2}


class CalibrationPointSerializer(serializers.Serializer):
    cm = serializers.DecimalField(min_value=0, **HEIGHT_FIELD)
    liters = serializers.DecimalField(min_value=0, **LITERS_FIELD)


@extend_schema_field(CalibrationPointSerializer(many=True))
class CalibrationField(serializers.JSONField):
    """Tabla de aforo; se valida y normaliza con `calibration.normalize`."""


class TankSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    immutable_fields = ("station",)
    fuel_type_name = serializers.CharField(source="fuel_type.name", read_only=True)
    last_reading = serializers.SerializerMethodField()
    calibration = CalibrationField(required=False)

    class Meta:
        model = Tank
        fields = "__all__"
        read_only_fields = AUTO_CODE_READ_ONLY

    def validate_calibration(self, points):
        try:
            return calibration.normalize(points)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def get_last_reading(self, obj) -> dict | None:
        reading = obj.readings.order_by("-measured_at").first()
        if reading is None:
            return None
        return {
            "liters": str(reading.liters),
            "height_cm": str(reading.height_cm) if reading.height_cm is not None else None,
            "measured_at": reading.measured_at.isoformat(),
        }


class TankChildSerializer(BaseModelSerializer):
    """La estación se toma del tanque; no la envía el cliente."""

    class Meta:
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY + ("station",)

    def create(self, validated_data):
        validated_data["station_id"] = validated_data["tank"].station_id
        return super().create(validated_data)


class TankReadingSerializer(TankChildSerializer):
    """Medición puntual: se registra la altura en cm y el servidor calcula los litros con el aforo."""

    tank_name = serializers.CharField(source="tank.name", read_only=True)
    height_cm = serializers.DecimalField(min_value=0, **HEIGHT_FIELD)

    class Meta(TankChildSerializer.Meta):
        model = TankReading
        read_only_fields = TankChildSerializer.Meta.read_only_fields + ("liters", "shift", "kind")

    def create(self, validated_data):
        validated_data["liters"] = calibration.liters_at(validated_data["tank"], validated_data["height_cm"])
        return super().create(validated_data)


class DeliverySerializer(TankChildSerializer):
    tank_name = serializers.CharField(source="tank.name", read_only=True)

    class Meta(TankChildSerializer.Meta):
        model = Delivery

    def validate(self, attrs):
        shift = attrs.get("shift")
        if shift is not None:
            if shift.station_id != attrs["tank"].station_id:
                raise serializers.ValidationError({"shift": "La jornada pertenece a otra estación."})
            if shift.status != LockStatus.DRAFT:
                raise serializers.ValidationError({"shift": "La jornada ya está cerrada."})
        return attrs


class ReconciliationSerializer(BaseModelSerializer):
    tank_name = serializers.CharField(source="tank.name", read_only=True)
    opening_height_cm = serializers.DecimalField(
        source="opening_reading.height_cm", read_only=True, allow_null=True, **HEIGHT_FIELD
    )
    closing_height_cm = serializers.DecimalField(
        source="closing_reading.height_cm", read_only=True, allow_null=True, **HEIGHT_FIELD
    )

    class Meta(BaseModelSerializer.Meta):
        model = Reconciliation


class TankHeightSerializer(serializers.Serializer):
    """Medición en cm de un tanque al abrir o cerrar la jornada."""

    tank = serializers.PrimaryKeyRelatedField(queryset=Tank.objects.all())
    height_cm = serializers.DecimalField(min_value=0, **HEIGHT_FIELD)


class ShiftReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankReading
        fields = ["id", "height_cm", "liters", "measured_at"]


class ShiftTankSerializer(serializers.Serializer):
    """Una fila del inventario de la jornada (GET /shifts/{id}/tanks)."""

    tank = serializers.UUIDField(source="tank.pk")
    tank_code = serializers.CharField(source="tank.code")
    tank_name = serializers.CharField(source="tank.name")
    fuel_type_name = serializers.CharField(source="tank.fuel_type.name")
    capacity = serializers.DecimalField(source="tank.capacity", **LITERS_FIELD)
    tolerance_pct = serializers.DecimalField(source="tank.tolerance_pct", max_digits=6, decimal_places=3)
    calibration = CalibrationPointSerializer(source="tank.calibration", many=True)
    opening = ShiftReadingSerializer(allow_null=True)
    closing = ShiftReadingSerializer(allow_null=True)
    deliveries_liters = serializers.DecimalField(allow_null=True, **LITERS_FIELD)
    sold_liters = serializers.DecimalField(allow_null=True, **LITERS_FIELD)
    expected_liters = serializers.DecimalField(allow_null=True, **LITERS_FIELD)
    reconciliation = serializers.SerializerMethodField()

    @extend_schema_field(ReconciliationSerializer(allow_null=True))
    def get_reconciliation(self, row):
        return ReconciliationSerializer(row["reconciliation"]).data if row["reconciliation"] else None


class RunReconciliationSerializer(serializers.Serializer):
    tank = serializers.PrimaryKeyRelatedField(queryset=Tank.objects.all())
    closing_reading = serializers.PrimaryKeyRelatedField(queryset=TankReading.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255)
