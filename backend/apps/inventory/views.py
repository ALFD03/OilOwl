from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.scoping import ensure_station_access
from apps.core.viewsets import BaseAppendOnlyViewSet, BaseModelViewSet, BaseReadOnlyViewSet

from . import services
from .models import Delivery, Reconciliation, Tank, TankReading
from .serializers import (
    DeliverySerializer,
    ReconciliationSerializer,
    RunReconciliationSerializer,
    TankReadingSerializer,
    TankSerializer,
)


class TankViewSet(BaseModelViewSet):
    queryset = Tank.objects.select_related("fuel_type")
    serializer_class = TankSerializer
    station_field = "station"
    filterset_fields = ["is_active", "fuel_type"]
    search_fields = ["code", "name"]


class TankReadingViewSet(BaseAppendOnlyViewSet):
    queryset = TankReading.objects.select_related("tank")
    serializer_class = TankReadingSerializer
    station_field = "station"
    filterset_fields = {"tank": ["exact"], "measured_at": ["gte", "lte"]}
    ordering_fields = ["measured_at"]


class DeliveryViewSet(BaseAppendOnlyViewSet):
    queryset = Delivery.objects.select_related("tank")
    serializer_class = DeliverySerializer
    station_field = "station"
    filterset_fields = {"tank": ["exact"], "delivered_at": ["gte", "lte"]}
    ordering_fields = ["delivered_at"]


class ReconciliationViewSet(BaseReadOnlyViewSet):
    queryset = Reconciliation.objects.select_related("tank")
    serializer_class = ReconciliationSerializer
    station_field = "station"
    filterset_fields = {
        "tank": ["exact"],
        "within_tolerance": ["exact"],
        "shift": ["exact"],
        "created_at": ["gte", "lte"],
    }
    ordering_fields = ["created_at"]
    permission_map = {"run": "inventory.run_reconciliation"}

    @extend_schema(request=RunReconciliationSerializer, responses={201: ReconciliationSerializer})
    @action(detail=False, methods=["post"])
    def run(self, request):
        data = RunReconciliationSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tank = data.validated_data["tank"]
        ensure_station_access(request.user, tank.station_id)
        result = services.reconcile(
            tank, data.validated_data["closing_reading"], notes=data.validated_data.get("notes", "")
        )
        return Response(ReconciliationSerializer(result).data, status=status.HTTP_201_CREATED)
