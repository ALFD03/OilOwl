from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit import services as audit
from apps.core.scoping import ensure_station_access
from apps.core.viewsets import BaseModelViewSet
from apps.inventory import services as inventory
from apps.inventory.models import TankReading
from apps.inventory.serializers import ShiftTankSerializer

from . import services
from .models import Shift
from .serializers import CloseShiftSerializer, SetRateSerializer, ShiftSerializer


class ShiftViewSet(BaseModelViewSet):
    queryset = Shift.objects.select_related("shift_template")
    serializer_class = ShiftSerializer
    station_field = "station"
    filterset_fields = {"date": ["exact", "gte", "lte"], "status": ["exact"], "shift_template": ["exact"]}
    ordering_fields = ["date", "created_at"]
    permission_map = {
        "close": "operations.close_shift",
        "set_rate": "operations.change_shift",
        "tanks": "operations.view_shift",
    }
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        data = serializer.validated_data
        ensure_station_access(self.request.user, data["station"].pk)
        template = data.get("shift_template")
        if template and template.station_id != data["station"].pk:
            from apps.core.exceptions import BusinessRuleError

            raise BusinessRuleError("El turno pertenece a otra estación.")
        rate, reference = services.resolve_rate(data["date"], data.get("rate"), self.request.user)
        from apps.closures.services import open_all_islands

        tank_readings = data.pop("tank_readings", [])
        initials = data.pop("initials", {})
        with transaction.atomic():
            instance = serializer.save(rate=rate, exchange_rate=reference)
            audit.record("create", instance, after=audit.snapshot(instance))
            inventory.record_shift_readings(instance, TankReading.Kind.OPENING, tank_readings)
            open_all_islands(instance, initials)

    @extend_schema(request=SetRateSerializer, responses=ShiftSerializer)
    @action(detail=True, methods=["post"], url_path="set-rate")
    def set_rate(self, request, pk=None):
        data = SetRateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        shift = services.set_shift_rate(self.get_object(), data.validated_data.get("rate"), request.user)
        return Response(ShiftSerializer(shift, context=self.get_serializer_context()).data)

    @extend_schema(request=CloseShiftSerializer, responses=ShiftSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        data = CloseShiftSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        shift = services.close_shift(self.get_object(), request.user, data.validated_data.get("tank_readings", []))
        return Response(ShiftSerializer(shift, context=self.get_serializer_context()).data)

    @extend_schema(responses=ShiftTankSerializer(many=True))
    @action(detail=True, methods=["get"])
    def tanks(self, request, pk=None):
        """Inventario de la jornada: medición de apertura, descargas, vendido, esperado y conciliación."""
        return Response(ShiftTankSerializer(inventory.shift_tank_status(self.get_object()), many=True).data)
