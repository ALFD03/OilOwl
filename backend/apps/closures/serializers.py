from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Attendant, Denomination, Island, PaymentTerminal, Pump
from apps.core.money import LITERS_FIELD, MONEY_FIELD
from apps.core.serializers import BaseModelSerializer
from apps.operations.models import Shift

from . import services
from .models import Closure, ClosureAdjustment, ClosureLine, MeterReading, PaymentMethod


class MeterReadingSerializer(serializers.ModelSerializer):
    pump_code = serializers.CharField(source="pump.code", read_only=True)
    fuel_type = serializers.UUIDField(source="pump.fuel_type_id", read_only=True)
    fuel_type_name = serializers.CharField(source="pump.fuel_type.name", read_only=True)
    has_gap = serializers.BooleanField(read_only=True)

    class Meta:
        model = MeterReading
        exclude = ["closure", "created_by", "updated_by"]


class ClosureLineSerializer(serializers.ModelSerializer):
    terminal_name = serializers.CharField(source="terminal.name", read_only=True, default=None)
    denomination_value = serializers.DecimalField(
        source="denomination.value", read_only=True, default=None, max_digits=12, decimal_places=2
    )

    class Meta:
        model = ClosureLine
        exclude = ["closure", "created_by", "updated_by"]


class MethodTotalSerializer(serializers.Serializer):
    method = serializers.CharField()
    currency = serializers.CharField()
    amount = serializers.DecimalField(**MONEY_FIELD)
    amount_usd = serializers.DecimalField(**MONEY_FIELD)
    amount_ves = serializers.DecimalField(**MONEY_FIELD)


class ClosureSerializer(BaseModelSerializer):
    readings = MeterReadingSerializer(many=True, read_only=True)
    lines = ClosureLineSerializer(many=True, read_only=True)
    method_totals = serializers.SerializerMethodField()
    island_name = serializers.CharField(source="island.name", read_only=True)
    attendant_name = serializers.CharField(source="attendant.name", read_only=True, default=None)
    shift_date = serializers.DateField(source="shift.date", read_only=True)

    class Meta:
        model = Closure
        fields = "__all__"
        read_only_fields = [f.name for f in Closure._meta.concrete_fields]

    @extend_schema_field(MethodTotalSerializer(many=True))
    def get_method_totals(self, obj):
        return MethodTotalSerializer(services.method_totals(obj), many=True).data


class ClosureListSerializer(BaseModelSerializer):
    island_name = serializers.CharField(source="island.name", read_only=True)
    attendant_name = serializers.CharField(source="attendant.name", read_only=True, default=None)
    shift_date = serializers.DateField(source="shift.date", read_only=True)

    class Meta:
        model = Closure
        fields = "__all__"


class OpenClosureSerializer(serializers.Serializer):
    shift = serializers.PrimaryKeyRelatedField(queryset=Shift.objects.all())
    island = serializers.PrimaryKeyRelatedField(queryset=Island.objects.filter(is_active=True))
    attendant = serializers.PrimaryKeyRelatedField(
        queryset=Attendant.objects.filter(is_active=True), required=False, allow_null=True
    )
    initials = serializers.DictField(child=serializers.DecimalField(min_value=0, **LITERS_FIELD), required=False)


class ReadingInputSerializer(serializers.Serializer):
    pump = serializers.PrimaryKeyRelatedField(queryset=Pump.objects.all())
    initial = serializers.DecimalField(required=False, min_value=0, **LITERS_FIELD)
    final = serializers.DecimalField(required=False, allow_null=True, min_value=0, **LITERS_FIELD)


class LineInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    denomination = serializers.PrimaryKeyRelatedField(
        queryset=Denomination.objects.all(), required=False, allow_null=True
    )
    terminal = serializers.PrimaryKeyRelatedField(
        queryset=PaymentTerminal.objects.all(), required=False, allow_null=True
    )
    quantity = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    amount = serializers.DecimalField(required=False, allow_null=True, min_value=0, **MONEY_FIELD)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=60)


class DraftSerializer(serializers.Serializer):
    attendant = serializers.PrimaryKeyRelatedField(queryset=Attendant.objects.all(), required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    readings = ReadingInputSerializer(many=True, required=False)
    lines = LineInputSerializer(many=True, required=False)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class ChainVerificationSerializer(serializers.Serializer):
    valid = serializers.BooleanField()
    checked = serializers.IntegerField()
    broken_at = serializers.CharField(allow_null=True)
    chain_seq = serializers.IntegerField(allow_null=True)
    problem = serializers.CharField(allow_null=True)
    head = serializers.CharField(required=False)


class ClosureAdjustmentSerializer(BaseModelSerializer):
    class Meta(BaseModelSerializer.Meta):
        model = ClosureAdjustment

    def validate_closure(self, closure):
        if closure.status != "LOCKED":
            raise serializers.ValidationError(
                "Solo se ajustan cierres bloqueados; los borradores se corrigen directamente."
            )
        return closure
