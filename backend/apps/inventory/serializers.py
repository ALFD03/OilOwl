from rest_framework import serializers

from apps.core.serializers import AUTO_CODE_READ_ONLY, BASE_READ_ONLY, BaseModelSerializer, ImmutableOnUpdateMixin

from .models import Delivery, Reconciliation, Tank, TankReading


class TankSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    immutable_fields = ("station",)
    fuel_type_name = serializers.CharField(source="fuel_type.name", read_only=True)
    last_reading = serializers.SerializerMethodField()

    class Meta:
        model = Tank
        fields = "__all__"
        read_only_fields = AUTO_CODE_READ_ONLY

    def get_last_reading(self, obj) -> dict | None:
        reading = obj.readings.order_by("-measured_at").first()
        if reading is None:
            return None
        return {"liters": str(reading.liters), "measured_at": reading.measured_at.isoformat()}


class TankChildSerializer(BaseModelSerializer):
    """La estación se toma del tanque; no la envía el cliente."""

    class Meta:
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY + ("station",)

    def create(self, validated_data):
        validated_data["station_id"] = validated_data["tank"].station_id
        return super().create(validated_data)


class TankReadingSerializer(TankChildSerializer):
    class Meta(TankChildSerializer.Meta):
        model = TankReading


class DeliverySerializer(TankChildSerializer):
    class Meta(TankChildSerializer.Meta):
        model = Delivery


class ReconciliationSerializer(BaseModelSerializer):
    tank_name = serializers.CharField(source="tank.name", read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = Reconciliation


class RunReconciliationSerializer(serializers.Serializer):
    tank = serializers.PrimaryKeyRelatedField(queryset=Tank.objects.all())
    closing_reading = serializers.PrimaryKeyRelatedField(queryset=TankReading.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255)
