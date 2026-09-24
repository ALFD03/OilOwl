from rest_framework import serializers

from apps.core.serializers import BASE_READ_ONLY, BaseModelSerializer

from .models import Attendant, Denomination, FuelPrice, FuelType, Island, PaymentTerminal, Pump, Station


def catalog_serializer(model_class, extra_fields=None, read_only=()):
    """Fábrica de serializers estándar para catálogos."""

    class Meta:
        model = model_class
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY + tuple(read_only)

    attrs = {"Meta": Meta, **(extra_fields or {})}
    return type(f"{model_class.__name__}Serializer", (BaseModelSerializer,), attrs)


StationSerializer = catalog_serializer(Station)
FuelTypeSerializer = catalog_serializer(FuelType)
IslandSerializer = catalog_serializer(Island)
DenominationSerializer = catalog_serializer(Denomination)
PaymentTerminalSerializer = catalog_serializer(PaymentTerminal)


class PumpSerializer(BaseModelSerializer):
    station = serializers.UUIDField(source="island.station_id", read_only=True)
    fuel_type_name = serializers.CharField(source="fuel_type.name", read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = Pump

    def validate(self, attrs):
        island = attrs.get("island") or getattr(self.instance, "island", None)
        tank = attrs.get("tank", getattr(self.instance, "tank", None))
        fuel_type = attrs.get("fuel_type") or getattr(self.instance, "fuel_type", None)
        if tank and island and tank.station_id != island.station_id:
            raise serializers.ValidationError({"tank": "El tanque es de otra estación."})
        if tank and fuel_type and tank.fuel_type_id != fuel_type.pk:
            raise serializers.ValidationError({"tank": "El tanque almacena otro combustible."})
        return attrs


class FuelPriceSerializer(BaseModelSerializer):
    fuel_type_name = serializers.CharField(source="fuel_type.name", read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = FuelPrice


class AttendantSerializer(BaseModelSerializer):
    class Meta:
        model = Attendant
        exclude = ["national_id_index"]
        read_only_fields = BASE_READ_ONLY
