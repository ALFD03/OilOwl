from rest_framework import serializers

from apps.core import codes
from apps.core.serializers import AUTO_CODE_READ_ONLY, BASE_READ_ONLY, BaseModelSerializer, ImmutableOnUpdateMixin

from .models import Attendant, Denomination, FuelPrice, FuelType, Island, PaymentTerminal, Pump, Station


def catalog_serializer(model_class, extra_fields=None, read_only=()):
    """Fábrica de serializers estándar para catálogos."""

    class Meta:
        model = model_class
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY + tuple(read_only)

    attrs = {"Meta": Meta, **(extra_fields or {})}
    return type(f"{model_class.__name__}Serializer", (BaseModelSerializer,), attrs)


FuelTypeSerializer = catalog_serializer(FuelType, read_only=("code",))


class IslandSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    immutable_fields = ("station",)

    class Meta:
        model = Island
        fields = "__all__"
        read_only_fields = AUTO_CODE_READ_ONLY


DenominationSerializer = catalog_serializer(Denomination)


class StationSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    """El prefijo (3 letras) se define al crear y no cambia: forma parte de todos los códigos."""

    immutable_fields = ("code",)
    # Se normaliza (espacios, minúsculas) antes de validar el formato en validate_code.
    code = serializers.CharField(max_length=10, label="prefijo")

    class Meta(BaseModelSerializer.Meta):
        model = Station

    def validate_code(self, value):
        value = codes.normalize_station_code(value)
        if not codes.STATION_CODE_RE.match(value):
            raise serializers.ValidationError("Debe tener exactamente 3 letras, sin números ni símbolos (p. ej. PLN).")
        if Station.objects.filter(code=value).exists():
            raise serializers.ValidationError("Ya existe una estación con ese prefijo.")
        return value


class PaymentTerminalSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    """El tipo define el código (PV/BP), por eso no se cambia después de crear."""

    immutable_fields = ("kind", "station")

    class Meta:
        model = PaymentTerminal
        fields = "__all__"
        read_only_fields = AUTO_CODE_READ_ONLY


class PumpSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    station = serializers.UUIDField(source="island.station_id", read_only=True)
    fuel_type_name = serializers.CharField(source="fuel_type.name", read_only=True)
    # La isla fija la estación del código: no se mueve un surtidor a otra isla.
    immutable_fields = ("island",)

    class Meta:
        model = Pump
        fields = "__all__"
        read_only_fields = AUTO_CODE_READ_ONLY

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


class AttendantSerializer(ImmutableOnUpdateMixin, BaseModelSerializer):
    immutable_fields = ("station",)

    class Meta:
        model = Attendant
        exclude = ["national_id_index"]
        read_only_fields = AUTO_CODE_READ_ONLY
