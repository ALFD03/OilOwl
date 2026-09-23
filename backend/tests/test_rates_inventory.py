from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.inventory.models import Delivery, TankReading
from apps.inventory.services import reconcile
from apps.rates import bcv
from apps.rates.models import ExchangeRate
from apps.rates.services import sync_from_bcv

pytestmark = pytest.mark.django_db


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload
        self.content = b"{}" if payload else b""

    def json(self):
        return self._payload


def test_bcv_parse():
    result = bcv.parse({"fuente": "oficial", "promedio": 853.4993, "fecha": "2026-09-23"})
    assert result.rate == Decimal("853.499300")
    assert result.valid_date == date(2026, 9, 23)


def test_bcv_fetch_walks_back_over_weekend():
    responses = [FakeResponse(404), FakeResponse(404), FakeResponse(200, {"promedio": 850.1, "fecha": "2026-09-18"})]
    with mock.patch("apps.rates.bcv.requests.get", side_effect=responses) as get:
        result = bcv.fetch(date(2026, 9, 20))
    assert result.valid_date == date(2026, 9, 18)
    assert get.call_args_list[0].args[0].endswith("/2026/09/20")


def test_sync_is_idempotent():
    with mock.patch("apps.rates.bcv.fetch", return_value=bcv.BCVRate(Decimal("850"), date(2026, 9, 18))):
        _, created = sync_from_bcv()
        _, created_again = sync_from_bcv()
    assert created and not created_again
    assert ExchangeRate.objects.count() == 1


def test_cron_requires_secret(client, settings):
    settings.CRON_SECRET = "s3cret"
    assert client.get("/api/cron/fetch-rate").status_code == 403
    with mock.patch("apps.rates.bcv.fetch", return_value=bcv.BCVRate(Decimal("850"), date(2026, 9, 18))):
        response = client.get("/api/cron/fetch-rate", HTTP_AUTHORIZATION="Bearer s3cret")
    assert response.status_code == 200


def test_manual_rate_requires_permission(world, make_user, client_for):
    client = client_for(make_user(stations=[world["station"]], perms=["operations.add_shift"]))
    response = client.post(
        "/api/shifts", {"station": str(world["station"].pk), "date": str(date.today()), "rate": "123.45"}, format="json"
    )
    assert response.status_code == 400


def test_reconciliation_measures_shrinkage(world):
    tank = world["tank"]
    start = timezone.now() - timedelta(hours=10)
    opening = TankReading.objects.create(station=tank.station, tank=tank, liters=Decimal("10000"), measured_at=start)
    Delivery.objects.create(
        station=tank.station, tank=tank, liters=Decimal("5000"), delivered_at=start + timedelta(hours=1)
    )
    closing = TankReading.objects.create(
        station=tank.station, tank=tank, liters=Decimal("14900"), measured_at=timezone.now()
    )
    result = reconcile(tank, closing, rate=Decimal("100"))
    assert result.opening_reading == opening
    assert result.expected_liters == Decimal("15000.000")
    assert result.variance_liters == Decimal("-100.000")
    assert result.variance_usd == Decimal("-50.00")
    assert result.variance_ves == Decimal("-5000.00")
    # Sin ventas, la diferencia se compara contra lo esperado: 100 / 15.000 = 0,6667 % > 0,5 %.
    assert result.variance_pct == Decimal("-0.6667")
    assert result.within_tolerance is False
