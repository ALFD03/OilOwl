"""Medición de tanques en cm (tabla de aforo) al abrir y cerrar la jornada, recepciones y merma."""

from datetime import date
from decimal import Decimal

import pytest

from apps.core.exceptions import BusinessRuleError
from apps.inventory import calibration
from apps.inventory.models import Reconciliation, TankReading

from .conftest import tank_heights
from .test_closures import open_and_fill

pytestmark = pytest.mark.django_db


def test_calibration_interpolates_between_points(world):
    tank = world["tank"]
    assert calibration.liters_at(tank, Decimal("50")) == Decimal("5000.000")
    assert calibration.liters_at(tank, Decimal("100")) == Decimal("10000.000")
    assert calibration.liters_at(tank, Decimal("175")) == Decimal("20000.000")
    assert calibration.liters_at(tank, Decimal("100.5")) == Decimal("10066.667")


def test_calibration_rejects_out_of_range_and_missing_table(world):
    tank = world["tank"]
    with pytest.raises(BusinessRuleError):
        calibration.liters_at(tank, Decimal("251"))
    tank.calibration = []
    with pytest.raises(BusinessRuleError, match="tabla de aforo"):
        calibration.liters_at(tank, Decimal("10"))


def test_calibration_is_validated_and_sorted(world, admin, client_for):
    client = client_for(admin)
    url = f"/api/tanks/{world['tank'].pk}"
    decreasing = [{"cm": "0", "liters": "0"}, {"cm": "10", "liters": "500"}, {"cm": "20", "liters": "400"}]
    assert client.patch(url, {"calibration": decreasing}, format="json").status_code == 400
    assert client.patch(url, {"calibration": [{"cm": "5", "liters": "10"}]}, format="json").status_code == 400

    unsorted = [{"cm": "20", "liters": "900"}, {"cm": "0", "liters": "0"}, {"cm": "10", "liters": "400"}]
    response = client.patch(url, {"calibration": unsorted}, format="json")
    assert response.status_code == 200, response.data
    assert [p["cm"] for p in response.data["calibration"]] == ["0.00", "10.00", "20.00"]


def test_spot_reading_computes_liters_from_height(world, admin, client_for):
    response = client_for(admin).post(
        "/api/tank-readings", {"tank": str(world["tank"].pk), "height_cm": "25", "method": "STICK"}, format="json"
    )
    assert response.status_code == 201, response.data
    assert Decimal(response.data["liters"]) == Decimal("2500.000")
    assert response.data["kind"] == "SPOT"


def test_shift_requires_opening_tank_heights(world, admin, client_for):
    response = client_for(admin).post(
        "/api/shifts", {"station": str(world["station"].pk), "date": str(date.today())}, format="json"
    )
    assert response.status_code == 400
    assert "T1" in response.data["error"]["message"]


def test_shift_measures_tanks_and_reconciles_on_close(world, admin, client_for):
    client = client_for(admin)
    closure = open_and_fill(client, world)  # abre con 100 cm = 10.000 L; P1 (del tanque) vende 100 L
    shift_id = closure["shift"]
    opening = TankReading.objects.get(shift_id=shift_id, kind=TankReading.Kind.OPENING)
    assert opening.liters == Decimal("10000.000")

    delivery = client.post(
        "/api/deliveries",
        {"tank": str(world["tank"].pk), "shift": shift_id, "liters": "500", "document": "G-1"},
        format="json",
    )
    assert delivery.status_code == 201, delivery.data

    [row] = client.get(f"/api/shifts/{shift_id}/tanks").data
    assert Decimal(row["deliveries_liters"]) == Decimal("500.000")
    assert Decimal(row["sold_liters"]) == Decimal("100.000")
    assert Decimal(row["expected_liters"]) == Decimal("10400.000")
    assert row["closing"] is None and row["reconciliation"] is None

    # Sin medición final no se puede cerrar.
    client.post(f"/api/closures/{closure['id']}/submit")
    client.post(f"/api/closures/{closure['id']}/lock")
    assert client.post(f"/api/shifts/{shift_id}/close", {}, format="json").status_code == 400

    # 102,25 cm = 10.300 L: faltan 100 L frente a los 10.400 esperados.
    closed = client.post(
        f"/api/shifts/{shift_id}/close", {"tank_readings": tank_heights(world, "102.25")}, format="json"
    )
    assert closed.status_code == 200, closed.data

    result = Reconciliation.objects.get(shift_id=shift_id)
    assert result.opening_reading == opening
    assert result.measured_liters == Decimal("10300.000")
    assert result.variance_liters == Decimal("-100.000")
    assert result.variance_usd == Decimal("-50.00")
    assert result.within_tolerance is False  # 100 L sobre 100 L vendidos = 100 %

    [row] = client.get(f"/api/shifts/{shift_id}/tanks").data
    assert Decimal(row["closing"]["height_cm"]) == Decimal("102.25")
    assert Decimal(row["reconciliation"]["variance_liters"]) == Decimal("-100.000")


def test_delivery_cannot_target_closed_shift(world, admin, client_for):
    client = client_for(admin)
    closure = open_and_fill(client, world)
    client.post(f"/api/closures/{closure['id']}/submit")
    client.post(f"/api/closures/{closure['id']}/lock")
    client.post(f"/api/shifts/{closure['shift']}/close", {"tank_readings": tank_heights(world)}, format="json")
    response = client.post(
        "/api/deliveries", {"tank": str(world["tank"].pk), "shift": closure["shift"], "liters": "10"}, format="json"
    )
    assert response.status_code == 400
