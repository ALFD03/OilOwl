from apps.core.viewsets import BaseAppendOnlyViewSet, BaseModelViewSet

from . import serializers as s
from .models import Attendant, Denomination, FuelPrice, FuelType, Island, PaymentTerminal, Pump, Station

CATALOG_FILTERS = ["is_active"]
CATALOG_SEARCH = ["code", "name"]


class StationViewSet(BaseModelViewSet):
    queryset = Station.objects.all()
    serializer_class = s.StationSerializer
    station_field = "id"
    filterset_fields = CATALOG_FILTERS
    search_fields = CATALOG_SEARCH + ["rif"]

    def check_station(self, instance):
        # Crear estaciones exige permiso de catálogo; el creador obtiene acceso automáticamente.
        if not self.request.user.is_superuser and self.action == "create":
            from apps.accounts.models import StationMembership

            StationMembership.objects.get_or_create(user=self.request.user, station=instance)
            self.request.user._station_ids_cache = None
            return
        super().check_station(instance)


class FuelTypeViewSet(BaseModelViewSet):
    queryset = FuelType.objects.all()
    serializer_class = s.FuelTypeSerializer
    filterset_fields = CATALOG_FILTERS
    search_fields = CATALOG_SEARCH


class DenominationViewSet(BaseModelViewSet):
    queryset = Denomination.objects.all()
    serializer_class = s.DenominationSerializer
    filterset_fields = ["currency", "kind", "is_active"]
    ordering_fields = ["value"]


class IslandViewSet(BaseModelViewSet):
    queryset = Island.objects.select_related("station")
    serializer_class = s.IslandSerializer
    ordering = ["code"]  # ESTACIÓN-TIPO-#### en orden correlativo
    station_field = "station"
    filterset_fields = CATALOG_FILTERS
    search_fields = CATALOG_SEARCH


class PumpViewSet(BaseModelViewSet):
    queryset = Pump.objects.select_related("island", "fuel_type", "tank")
    serializer_class = s.PumpSerializer
    ordering = ["code"]  # ESTACIÓN-TIPO-#### en orden correlativo
    station_field = "island__station"
    filterset_fields = CATALOG_FILTERS + ["island", "fuel_type", "tank"]
    search_fields = CATALOG_SEARCH


class PaymentTerminalViewSet(BaseModelViewSet):
    queryset = PaymentTerminal.objects.all()
    serializer_class = s.PaymentTerminalSerializer
    ordering = ["code"]  # ESTACIÓN-TIPO-#### en orden correlativo
    station_field = "station"
    filterset_fields = CATALOG_FILTERS + ["kind", "currency"]
    search_fields = CATALOG_SEARCH + ["bank", "serial"]


class AttendantViewSet(BaseModelViewSet):
    queryset = Attendant.objects.all()
    serializer_class = s.AttendantSerializer
    ordering = ["code"]  # ESTACIÓN-TIPO-#### en orden correlativo
    station_field = "station"
    filterset_fields = CATALOG_FILTERS
    search_fields = CATALOG_SEARCH


class FuelPriceViewSet(BaseAppendOnlyViewSet):
    """Historial de precios: un cambio de precio es un registro nuevo con su fecha de vigencia."""

    queryset = FuelPrice.objects.select_related("fuel_type")
    serializer_class = s.FuelPriceSerializer
    station_field = "station"
    filterset_fields = ["fuel_type", "currency"]
    ordering_fields = ["valid_from"]
