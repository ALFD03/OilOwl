"""Pagos en Bs cuentan para la venta en $ según la tasa BCV de la jornada (caso reportado en QA)."""

from datetime import date
from decimal import Decimal

import pytest

from apps.closures.models import Closure
from apps.operations.models import Shift

from .test_closures import SUPERVISOR_PERMS, open_and_fill

pytestmark = pytest.mark.django_db


def test_bolivares_count_toward_dollar_sale(world, admin, client_for):
    data = open_and_fill(client_for(admin), world)
    # 45 $ en efectivo + 2.900 Bs (efectivo, punto y BioPago) a 100 Bs/$ = 74 $ declarados.
    assert Decimal(data["declared_usd"]) == Decimal("74.00")
    bolivares = {m["method"]: m for m in data["method_totals"]}
    assert Decimal(bolivares["POS"]["amount_usd"]) == Decimal("15.00")


@pytest.mark.parametrize("rate", ["0", "-5"])
def test_manual_rate_must_be_positive(world, admin, client_for, rate):
    response = client_for(admin).post(
        "/api/shifts", {"station": str(world["station"].pk), "date": str(date.today()), "rate": rate}, format="json"
    )
    assert response.status_code == 400
    assert not Shift.objects.exists()


def test_price_must_be_positive(world, admin, client_for):
    response = client_for(admin).post(
        "/api/fuel-prices",
        {"station": str(world["station"].pk), "fuel_type": str(world["g91"].pk), "price": "0", "currency": "USD"},
        format="json",
    )
    assert response.status_code == 400


def test_zero_rate_is_never_used_silently(world, admin, client_for):
    client = client_for(admin)
    data = open_and_fill(client, world)
    Shift.objects.filter(pk=data["shift"]).update(rate=0)
    Closure.objects.filter(pk=data["id"]).update(rate=0)
    response = client.patch(f"/api/closures/{data['id']}", {"notes": "x"}, format="json")
    assert response.status_code == 400
    assert "tasa" in response.data["error"]["message"]


def test_set_rate_fixes_shift_and_recalculates_drafts(world, make_user, client_for):
    client = client_for(make_user(stations=[world["station"]], perms=SUPERVISOR_PERMS + ["operations.change_shift"]))
    data = open_and_fill(client, world)
    Shift.objects.filter(pk=data["shift"]).update(rate=0)
    Closure.objects.filter(pk=data["id"]).update(rate=0)

    # Sin tasa manual se aplica la BCV vigente (100 Bs/$ en el escenario).
    response = client.post(f"/api/shifts/{data['shift']}/set-rate", {}, format="json")
    assert response.status_code == 200, response.data
    assert Decimal(response.data["rate"]) == Decimal("100")
    closure = client.get(f"/api/closures/{data['id']}").data
    assert Decimal(closure["rate"]) == Decimal("100")
    assert Decimal(closure["declared_usd"]) == Decimal("74.00")

    # Una tasa manual distinta a la oficial exige permiso.
    assert client.post(f"/api/shifts/{data['shift']}/set-rate", {"rate": "120"}, format="json").status_code == 400


def test_set_rate_refused_after_submit(world, admin, client_for):
    client = client_for(admin)
    data = open_and_fill(client, world)
    client.post(f"/api/closures/{data['id']}/submit")
    response = client.post(f"/api/shifts/{data['shift']}/set-rate", {"rate": "150"}, format="json")
    assert response.status_code == 400
    assert Decimal(Shift.objects.get().rate) == Decimal("100")
