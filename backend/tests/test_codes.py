"""Nomenclatura ESTACIÓN-TIPO-#### (p. ej. PLN-SU-0001)."""

import importlib
from datetime import time
from decimal import Decimal

import pytest
from django.apps import apps

from apps.catalog.models import Attendant, FuelType, Island, PaymentTerminal, Pump, Station
from apps.inventory.models import Tank
from apps.scheduling.models import ShiftTemplate

pytestmark = pytest.mark.django_db


@pytest.fixture
def pln(db):
    return Station.objects.create(code="PLN", name="Platillon")


def test_station_prefix_is_normalized_and_validated(admin, client_for):
    client = client_for(admin)
    ok = client.post("/api/stations", {"code": " pln ", "name": "Platillon"}, format="json")
    assert ok.status_code == 201 and ok.data["code"] == "PLN"
    for bad in ["PL1", "PLNA", "P-N", "PÑN", ""]:
        response = client.post("/api/stations", {"code": bad, "name": "X"}, format="json")
        assert response.status_code == 400, bad
    assert client.post("/api/stations", {"code": "pln", "name": "Otra"}, format="json").status_code == 400


def test_station_prefix_cannot_change(admin, client_for, pln):
    client_for(admin).patch(f"/api/stations/{pln.pk}", {"code": "ABC", "name": "Renombrada"}, format="json")
    pln.refresh_from_db()
    assert pln.code == "PLN" and pln.name == "Renombrada"


def test_every_element_gets_its_code(admin, client_for, pln):
    client = client_for(admin)
    g91 = FuelType.objects.create(code="G91", name="Gasolina 91")
    island = client.post(
        "/api/islands", {"station": str(pln.pk), "name": "Isla 1", "code": "IGNORADO"}, format="json"
    ).data
    tank = client.post(
        "/api/tanks",
        {"station": str(pln.pk), "name": "T91", "fuel_type": str(g91.pk), "capacity": "30000", "tolerance_pct": "0.5"},
        format="json",
    ).data
    pump = client.post(
        "/api/pumps",
        {"island": island["id"], "name": "S1", "fuel_type": str(g91.pk), "tank": tank["id"]},
        format="json",
    ).data
    pos = client.post(
        "/api/terminals", {"station": str(pln.pk), "name": "Banesco", "kind": "POS", "currency": "VES"}, format="json"
    ).data
    bio = client.post(
        "/api/terminals", {"station": str(pln.pk), "name": "BDV", "kind": "BIOPAGO", "currency": "VES"}, format="json"
    ).data
    person = client.post("/api/attendants", {"station": str(pln.pk), "name": "Ana"}, format="json").data
    shift = client.post(
        "/api/shift-templates",
        {"station": str(pln.pk), "name": "Mañana", "start_time": "06:00", "end_time": "14:00"},
        format="json",
    ).data
    assert [island["code"], tank["code"], pump["code"], pos["code"], bio["code"], person["code"], shift["code"]] == [
        "PLN-IS-0001",
        "PLN-TQ-0001",
        "PLN-SU-0001",
        "PLN-PV-0001",
        "PLN-BP-0001",
        "PLN-BO-0001",
        "PLN-TU-0001",
    ]


def test_numbers_are_per_station_and_never_reused(pln):
    other = Station.objects.create(code="CAR", name="Caracas")
    first = Island.objects.create(station=pln, name="1")
    first.is_active = False
    first.save()
    second = Island.objects.create(station=pln, name="2")
    elsewhere = Island.objects.create(station=other, name="1")
    assert (first.code, second.code, elsewhere.code) == ("PLN-IS-0001", "PLN-IS-0002", "CAR-IS-0001")


def test_code_and_terminal_kind_are_fixed_after_creation(admin, client_for, pln):
    terminal = PaymentTerminal.objects.create(station=pln, name="Banesco", kind="POS")
    client_for(admin).patch(
        f"/api/terminals/{terminal.pk}", {"code": "X", "kind": "BIOPAGO", "name": "Banesco 2"}, format="json"
    )
    terminal.refresh_from_db()
    assert (terminal.code, terminal.kind, terminal.name) == ("PLN-PV-0001", "POS", "Banesco 2")


def test_migration_renumbers_existing_elements_in_creation_order():
    station = Station.objects.create(code="E0X"[:3], name="Platillon CA")
    g91 = FuelType.objects.create(code="G91", name="Gasolina 91")
    a = Island.objects.create(station=station, name="Isla 1", code="I0001")
    b = Island.objects.create(station=station, name="Isla 2", code="I0002")
    Pump.objects.create(island=a, fuel_type=g91, name="S1", code="S0001")
    Tank.objects.create(
        station=station, fuel_type=g91, name="T", code="T0001", capacity=Decimal(1), tolerance_pct=Decimal(1)
    )
    Attendant.objects.create(station=station, name="Ana", code="PB0001")
    PaymentTerminal.objects.create(station=station, name="BDV", kind="BIOPAGO", code="B0001")
    ShiftTemplate.objects.create(station=station, name="M", code="M", start_time=time(6), end_time=time(14))
    Station.objects.filter(pk=station.pk).update(code="PLN")

    migration = importlib.import_module("apps.catalog.migrations.0005_element_codes")
    migration.renumber(apps, None)

    a.refresh_from_db()
    b.refresh_from_db()
    assert (a.code, b.code) == ("PLN-IS-0001", "PLN-IS-0002")
    assert Pump.objects.get().code == "PLN-SU-0001"
    assert Attendant.objects.get().code == "PLN-BO-0001"
    assert PaymentTerminal.objects.get().code == "PLN-BP-0001"
    # Lo siguiente que se cree continúa la secuencia.
    assert Island.objects.create(station=station, name="Isla 3").code == "PLN-IS-0003"


def test_station_code_migration_derives_three_letters():
    migration = importlib.import_module("apps.catalog.migrations.0004_alter_station_code_codesequence")
    s1 = Station.objects.create(code="AAA", name="Platillón CA")
    s2 = Station.objects.create(code="BBB", name="Platanal")
    Station.objects.filter(pk=s1.pk).update(code="E1")
    Station.objects.filter(pk=s2.pk).update(code="E2")
    migration.normalize_station_codes(apps, None)
    s1.refresh_from_db()
    s2.refresh_from_db()
    assert s1.code == "PLA" and s2.code == "PLB"


def test_fuel_types_get_a_global_code(admin, client_for):
    client = client_for(admin)
    first = client.post("/api/fuel-types", {"name": "Gasolina 91", "code": "IGNORADO"}, format="json")
    assert first.status_code == 201, first.data
    second = client.post("/api/fuel-types", {"name": "Gasoil"}, format="json").data
    assert (first.data["code"], second["code"]) == ("CB-0001", "CB-0002")
    client.patch(f"/api/fuel-types/{second['id']}", {"code": "X", "name": "Gasoil B"}, format="json")
    assert FuelType.objects.get(pk=second["id"]).code == "CB-0002"


def test_fuel_type_migration_renumbers_in_creation_order():
    later = FuelType.objects.create(code="CB-0001", name="Gasoil")  # choca con el código nuevo del primero
    FuelType.objects.filter(pk=later.pk).update(created_at="2030-01-01T00:00:00Z")
    first = FuelType.objects.create(code="G91", name="Gasolina 91")

    migration = importlib.import_module("apps.catalog.migrations.0006_fuel_type_codes")
    migration.renumber_fuel_types(apps, None)

    first.refresh_from_db()
    later.refresh_from_db()
    assert (first.code, later.code) == ("CB-0001", "CB-0002")
    assert FuelType.objects.create(name="Gasolina 95").code == "CB-0003"
