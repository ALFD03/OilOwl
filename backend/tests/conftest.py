import os

os.environ.setdefault("DJANGO_TESTING", "true")

from datetime import date, timedelta  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from django.contrib.auth.models import Permission  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import StationMembership, User  # noqa: E402
from apps.catalog.models import (  # noqa: E402
    Attendant,
    Denomination,
    FuelPrice,
    FuelType,
    Island,
    PaymentTerminal,
    Pump,
    Station,
)
from apps.inventory.models import Tank  # noqa: E402
from apps.rates.models import ExchangeRate  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_cache():
    from django.core.cache import cache

    cache.clear()


def grant(user, *codes):
    for code in codes:
        app_label, codename = code.split(".")
        user.user_permissions.add(Permission.objects.get(content_type__app_label=app_label, codename=codename))
    # Limpia la caché de permisos del objeto.
    for attr in ("_perm_cache", "_user_perm_cache", "_group_perm_cache"):
        if hasattr(user, attr):
            delattr(user, attr)
    return user


@pytest.fixture
def station(db):
    return Station.objects.create(code="E1", name="Estación Uno")


@pytest.fixture
def other_station(db):
    return Station.objects.create(code="E2", name="Estación Dos")


@pytest.fixture
def world(station):
    """Una estación operativa completa: 1 isla con 2 surtidores, precios, tasa, terminales."""
    g91 = FuelType.objects.create(code="G91", name="Gasolina 91")
    goil = FuelType.objects.create(code="GOIL", name="Gasoil")
    tank = Tank.objects.create(
        station=station,
        code="T1",
        name="Tanque 91",
        fuel_type=g91,
        capacity=Decimal("30000"),
        tolerance_pct=Decimal("0.5"),
    )
    island = Island.objects.create(station=station, code="I1", name="Isla 1")
    p1 = Pump.objects.create(
        island=island, fuel_type=g91, tank=tank, code="P1", name="Surtidor 1", meter_max=Decimal("999999.999")
    )
    p2 = Pump.objects.create(island=island, fuel_type=goil, code="P2", name="Surtidor 2")
    past = timezone.now() - timedelta(days=1)
    FuelPrice.objects.create(station=station, fuel_type=g91, price=Decimal("0.50"), currency="USD", valid_from=past)
    FuelPrice.objects.create(station=station, fuel_type=goil, price=Decimal("0.50"), currency="USD", valid_from=past)
    ExchangeRate.objects.create(valid_date=date.today() - timedelta(days=1), rate=Decimal("100"), source="MANUAL")
    pos = PaymentTerminal.objects.create(station=station, code="POS1", name="Banesco", kind="POS", currency="VES")
    bio = PaymentTerminal.objects.create(
        station=station, code="BIO1", name="BioPago BDV", kind="BIOPAGO", currency="VES"
    )
    attendant = Attendant.objects.create(
        station=station, code="B1", name="Pedro Pérez", national_id="V-12345678", phone="0414-0000000"
    )
    usd20 = Denomination.objects.create(currency="USD", value=Decimal("20"), kind="BILL")
    usd1 = Denomination.objects.create(currency="USD", value=Decimal("1"), kind="BILL")
    ves100 = Denomination.objects.create(currency="VES", value=Decimal("100"), kind="BILL")
    return {
        "station": station,
        "tank": tank,
        "island": island,
        "p1": p1,
        "p2": p2,
        "g91": g91,
        "pos": pos,
        "bio": bio,
        "attendant": attendant,
        "usd20": usd20,
        "usd1": usd1,
        "ves100": ves100,
    }


@pytest.fixture
def make_user(db):
    def _make(username="operador", stations=(), perms=(), **extra):
        user = User.objects.create_user(username=username, password="ClaveSegura#2026", **extra)
        for station in stations:
            StationMembership.objects.create(user=user, station=station)
        return grant(user, *perms)

    return _make


@pytest.fixture
def admin(db):
    return User.objects.create_superuser(username="admin", password="ClaveSegura#2026")


@pytest.fixture
def client_for():
    def _client(user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    return _client
