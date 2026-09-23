from datetime import date, timedelta

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import ActionPermission
from apps.core.scoping import allowed_station_ids, ensure_station_access
from apps.core.viewsets import ContextMixin

from . import services


@extend_schema(responses=OpenApiTypes.OBJECT)
class ReportViewSet(ContextMixin, viewsets.ViewSet):
    """Reportes agregados. Parámetros: station (opcional), from, to (YYYY-MM-DD; por defecto 30 días)."""

    permission_classes = [ActionPermission]
    permission_map = {
        "summary": "reports.view_dashboard",
        "sales_by_day": "reports.view_sales_report",
        "liters_by_fuel": "reports.view_sales_report",
        "payment_methods": "reports.view_sales_report",
        "differences": "reports.view_differences_report",
        "shrinkage": "reports.view_inventory_report",
    }

    def _params(self, request):
        try:
            date_to = date.fromisoformat(request.query_params["to"]) if request.query_params.get("to") else date.today()
            date_from = (
                date.fromisoformat(request.query_params["from"])
                if request.query_params.get("from")
                else date_to - timedelta(days=29)
            )
        except ValueError as exc:
            raise ValidationError({"from": "Fecha inválida (YYYY-MM-DD)."}) from exc
        if date_from > date_to or (date_to - date_from).days > 366:
            raise ValidationError({"from": "Rango de fechas inválido (máximo un año)."})
        station = request.query_params.get("station")
        if station:
            from uuid import UUID

            try:
                station_id = UUID(station)
            except ValueError as exc:
                raise ValidationError({"station": "Identificador inválido."}) from exc
            ensure_station_access(request.user, station_id)
            station_ids = {station_id}
        else:
            station_ids = allowed_station_ids(request.user)
        return station_ids, date_from, date_to

    def _run(self, request, fn):
        return Response(fn(*self._params(request)))

    @action(detail=False)
    def summary(self, request):
        return self._run(request, services.summary)

    @action(detail=False, url_path="sales-by-day")
    def sales_by_day(self, request):
        return self._run(request, services.sales_by_day)

    @action(detail=False, url_path="liters-by-fuel")
    def liters_by_fuel(self, request):
        return self._run(request, services.liters_by_fuel)

    @action(detail=False, url_path="payment-methods")
    def payment_methods(self, request):
        return self._run(request, services.payment_methods)

    @action(detail=False)
    def differences(self, request):
        return self._run(request, services.differences)

    @action(detail=False)
    def shrinkage(self, request):
        return self._run(request, services.shrinkage)
