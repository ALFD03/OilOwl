from django.db import transaction
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.routers import DefaultRouter

from apps.accounts import views as accounts
from apps.audit.views import AuditLogViewSet
from apps.catalog import views as catalog
from apps.closures import views as closures
from apps.inventory import views as inventory
from apps.operations.views import ShiftViewSet
from apps.rates.views import CronFetchRateView, ExchangeRateViewSet
from apps.reports.views import ReportViewSet
from apps.scheduling import views as scheduling

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
routes = {
    "users": accounts.UserViewSet,
    "roles": accounts.RoleViewSet,
    "permissions": accounts.PermissionViewSet,
    "stations": catalog.StationViewSet,
    "fuel-types": catalog.FuelTypeViewSet,
    "islands": catalog.IslandViewSet,
    "pumps": catalog.PumpViewSet,
    "fuel-prices": catalog.FuelPriceViewSet,
    "denominations": catalog.DenominationViewSet,
    "terminals": catalog.PaymentTerminalViewSet,
    "attendants": catalog.AttendantViewSet,
    "exchange-rates": ExchangeRateViewSet,
    "shift-templates": scheduling.ShiftTemplateViewSet,
    "assignments": scheduling.AssignmentViewSet,
    "shifts": ShiftViewSet,
    "closures": closures.ClosureViewSet,
    "closure-adjustments": closures.ClosureAdjustmentViewSet,
    "tanks": inventory.TankViewSet,
    "tank-readings": inventory.TankReadingViewSet,
    "deliveries": inventory.DeliveryViewSet,
    "reconciliations": inventory.ReconciliationViewSet,
    "audit-logs": AuditLogViewSet,
}
for prefix, viewset in routes.items():
    router.register(prefix, viewset, basename=prefix)
router.register("reports", ReportViewSet, basename="reports")

auth_patterns = [
    path("login", transaction.non_atomic_requests(accounts.LoginView.as_view())),
    path("refresh", accounts.RefreshView.as_view()),
    path("logout", accounts.LogoutView.as_view()),
    path("me", accounts.MeView.as_view()),
    path("change-password", accounts.ChangePasswordView.as_view()),
]

urlpatterns = [
    path("api/auth/", include(auth_patterns)),
    path("api/cron/fetch-rate", CronFetchRateView.as_view()),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/", include(router.urls)),
]
