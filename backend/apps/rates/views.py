import hmac

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import AUTHENTICATED
from apps.core.viewsets import BaseAppendOnlyViewSet

from . import bcv
from .models import ExchangeRate
from .serializers import ExchangeRateSerializer, FetchRateSerializer
from .services import sync_from_bcv


class ExchangeRateViewSet(BaseAppendOnlyViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_fields = ["source", "valid_date"]
    ordering_fields = ["valid_date"]
    permission_map = {
        "create": "rates.override_rate",
        "fetch": "rates.fetch_rate",
        "current": AUTHENTICATED,
    }

    def perform_create(self, serializer):
        serializer.validated_data["source"] = ExchangeRate.Source.MANUAL
        super().perform_create(serializer)

    @extend_schema(responses=ExchangeRateSerializer)
    @action(detail=False, methods=["get"])
    def current(self, request):
        rate = ExchangeRate.objects.current(request.query_params.get("date") or None)
        if rate is None:
            return Response(
                {"error": {"code": "not_found", "message": "No hay tasa registrada.", "details": None}}, status=404
            )
        return Response(ExchangeRateSerializer(rate).data)

    @extend_schema(request=FetchRateSerializer, responses=ExchangeRateSerializer)
    @action(detail=False, methods=["post"])
    def fetch(self, request):
        params = FetchRateSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        try:
            rate, created = sync_from_bcv(params.validated_data.get("date"))
        except bcv.BCVError as exc:
            raise BusinessRuleError(str(exc)) from exc
        return Response(
            ExchangeRateSerializer(rate).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


@extend_schema(exclude=True)
class CronFetchRateView(APIView):
    """Invocado por Vercel Cron con `Authorization: Bearer $CRON_SECRET`."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        secret = settings.CRON_SECRET
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not secret or not hmac.compare_digest(header, f"Bearer {secret}"):
            raise PermissionDenied()
        try:
            rate, created = sync_from_bcv()
        except bcv.BCVError as exc:
            return Response({"ok": False, "error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"ok": True, "created": created, "valid_date": rate.valid_date, "rate": str(rate.rate)})
