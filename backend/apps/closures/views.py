from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.scoping import ensure_station_access
from apps.core.viewsets import BaseAppendOnlyViewSet, BaseGenericViewSet, mixins

from . import services
from .models import Closure, ClosureAdjustment
from .serializers import (
    ChainVerificationSerializer,
    ClosureAdjustmentSerializer,
    ClosureListSerializer,
    ClosureSerializer,
    DraftSerializer,
    OpenClosureSerializer,
    ReasonSerializer,
)


class ClosureViewSet(BaseGenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin):
    """Cierre de caja por isla. Los montos siempre se calculan en el servidor."""

    queryset = Closure.objects.select_related("island", "attendant", "shift")
    serializer_class = ClosureSerializer
    station_field = "station"
    filterset_fields = {
        "shift": ["exact"],
        "island": ["exact"],
        "attendant": ["exact"],
        "status": ["exact"],
        "result": ["exact"],
        "shift__date": ["exact", "gte", "lte"],
    }
    ordering_fields = ["created_at", "shift__date", "diff_usd"]
    permission_map = {
        "create": "closures.add_closure",
        "partial_update": "closures.change_closure",
        "submit": "closures.submit_closure",
        "reopen": "closures.reopen_closure",
        "lock": "closures.lock_closure",
        "verify_chain": "closures.verify_chain",
    }

    def get_serializer_class(self):
        return ClosureListSerializer if self.action == "list" else ClosureSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != "list":
            queryset = queryset.prefetch_related("readings__pump__fuel_type", "lines__terminal", "lines__denomination")
        return queryset

    def _detail(self, closure, code=status.HTTP_200_OK):
        closure = self.get_queryset().get(pk=closure.pk)
        return Response(ClosureSerializer(closure, context=self.get_serializer_context()).data, status=code)

    @extend_schema(request=OpenClosureSerializer, responses={201: ClosureSerializer})
    def create(self, request):
        data = OpenClosureSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        shift = data.validated_data["shift"]
        ensure_station_access(request.user, shift.station_id)
        closure = services.open_closure(
            shift,
            data.validated_data["island"],
            data.validated_data.get("attendant"),
            data.validated_data.get("initials"),
        )
        return self._detail(closure, status.HTTP_201_CREATED)

    @extend_schema(request=DraftSerializer, responses=ClosureSerializer)
    def partial_update(self, request, pk=None):
        closure = self.get_object()
        data = DraftSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        closure = services.save_draft(
            closure,
            readings=values.get("readings"),
            lines=values.get("lines"),
            attendant=values["attendant"] if "attendant" in values else ...,
            notes=values.get("notes"),
        )
        return self._detail(closure)

    @extend_schema(request=None, responses=ClosureSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self._detail(services.submit(self.get_object(), request.user))

    @extend_schema(request=ReasonSerializer, responses=ClosureSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._detail(services.reopen(self.get_object(), request.user, data.validated_data["reason"]))

    @extend_schema(request=None, responses=ClosureSerializer)
    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        return self._detail(services.lock(self.get_object(), request.user))

    @extend_schema(parameters=[OpenApiParameter("station", str, required=True)], responses=ChainVerificationSerializer)
    @action(detail=False, methods=["get"], url_path="verify-chain")
    def verify_chain(self, request):
        station = request.query_params.get("station")
        if not station:
            raise ValidationError({"station": "Requerido."})
        try:
            from uuid import UUID

            station_id = UUID(station)
        except ValueError as exc:
            raise ValidationError({"station": "Identificador inválido."}) from exc
        ensure_station_access(request.user, station_id)
        return Response(services.verify_chain(station_id))


class ClosureAdjustmentViewSet(BaseAppendOnlyViewSet):
    queryset = ClosureAdjustment.objects.select_related("closure")
    serializer_class = ClosureAdjustmentSerializer
    station_field = "closure__station"
    filterset_fields = ["closure"]
