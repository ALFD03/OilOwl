from datetime import date
from decimal import Decimal

import pytest
from django.db import connection, transaction
from django.db.utils import DatabaseError

from apps.audit.models import AuditLog
from apps.closures import services
from apps.closures.models import Closure, ClosureLine, MeterReading
from apps.core.exceptions import ImmutableRecordError
from apps.operations.models import Shift

from .conftest import tank_heights

pytestmark = pytest.mark.django_db

OPERATOR_PERMS = [
    "operations.add_shift",
    "operations.view_shift",
    "closures.add_closure",
    "closures.change_closure",
    "closures.view_closure",
    "closures.submit_closure",
]
SUPERVISOR_PERMS = OPERATOR_PERMS + ["closures.lock_closure", "closures.verify_chain", "operations.close_shift"]


def open_shift(client, world, initials=("1000", "2000"), **extra):
    """Abre la jornada (con la medición de tanques); la isla se abre sola. Devuelve el cierre de la isla."""
    body = {"station": str(world["station"].pk), "date": str(date.today()), "tank_readings": tank_heights(world)}
    if initials:
        body["initials"] = {str(world["p1"].pk): initials[0], str(world["p2"].pk): initials[1]}
    shift = client.post("/api/shifts", {**body, **extra}, format="json")
    assert shift.status_code == 201, shift.data
    closures = client.get("/api/closures", {"shift": shift.data["id"]}).data["results"]
    assert [str(c["island"]) for c in closures] == [str(world["island"].pk)]
    return client.get(f"/api/closures/{closures[0]['id']}").data


def open_and_fill(client, world, final_p1="1100", final_p2="2050"):
    """Abre la jornada (P1 inicia en 1000, P2 en 2000) y registra finales y arqueo de la isla."""
    closure = open_shift(client, world)
    # Ventas: (100 + 50) L × 0.50 $ = 75 $ = 7.500 Bs a tasa 100.
    lines = [
        {"method": "CASH_USD", "denomination": str(world["usd20"].pk), "quantity": 2},  # 40 $
        {"method": "CASH_USD", "denomination": str(world["usd1"].pk), "quantity": 5},  # 5 $
        {"method": "CASH_VES", "denomination": str(world["ves100"].pk), "quantity": 10},  # 1.000 Bs
        {"method": "POS", "terminal": str(world["pos"].pk), "amount": "1500.00", "reference": "L-001"},
        {"method": "BIOPAGO", "terminal": str(world["bio"].pk), "amount": "400.00"},
    ]  # total = 45 $ + 2.900 Bs = 45 $ + 29 $ = 74 $ → faltante de 1 $
    response = client.patch(
        f"/api/closures/{closure['id']}",
        {
            "attendant": str(world["attendant"].pk),
            "readings": [
                {"pump": str(world["p1"].pk), "final": final_p1},
                {"pump": str(world["p2"].pk), "final": final_p2},
            ],
            "lines": lines,
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    return response.data


def test_full_closure_flow_computes_differences(world, make_user, client_for):
    user = make_user(stations=[world["station"]], perms=SUPERVISOR_PERMS)
    client = client_for(user)
    data = open_and_fill(client, world)

    assert Decimal(data["expected_liters"]) == Decimal("150.000")
    assert Decimal(data["expected_usd"]) == Decimal("75.00")
    assert Decimal(data["expected_ves"]) == Decimal("7500.00")
    assert Decimal(data["declared_usd"]) == Decimal("74.00")
    assert Decimal(data["declared_ves"]) == Decimal("7400.00")
    assert Decimal(data["diff_usd"]) == Decimal("-1.00")
    assert Decimal(data["diff_ves"]) == Decimal("-100.00")
    assert Decimal(data["diff_liters"]) == Decimal("-2.000")
    assert data["result"] == "SHORT"

    assert client.post(f"/api/closures/{data['id']}/submit").status_code == 200
    locked = client.post(f"/api/closures/{data['id']}/lock")
    assert locked.status_code == 200
    assert locked.data["status"] == "LOCKED"
    assert len(locked.data["content_hash"]) == 64

    # La API rechaza cualquier cambio.
    assert client.patch(f"/api/closures/{data['id']}", {"notes": "cambio"}, format="json").status_code == 409
    assert AuditLog.objects.filter(action="lock", object_id=data["id"]).exists()

    # La siguiente jornada toma como inicial la lectura final anterior.
    shift = Shift.objects.get()
    shift_close = client.post(
        f"/api/shifts/{shift.pk}/close", {"tank_readings": tank_heights(world, "99")}, format="json"
    )
    assert shift_close.status_code == 200, shift_close.data


def test_cannot_lock_without_permission(world, make_user, client_for):
    client = client_for(make_user(stations=[world["station"]], perms=OPERATOR_PERMS))
    data = open_and_fill(client, world)
    client.post(f"/api/closures/{data['id']}/submit")
    assert client.post(f"/api/closures/{data['id']}/lock").status_code == 403


def test_other_station_is_invisible(world, other_station, make_user, client_for):
    owner = client_for(make_user(stations=[world["station"]], perms=SUPERVISOR_PERMS))
    data = open_and_fill(owner, world)
    stranger = client_for(make_user(username="ajeno", stations=[other_station], perms=SUPERVISOR_PERMS))
    assert stranger.get(f"/api/closures/{data['id']}").status_code == 404
    assert stranger.get("/api/closures").data["count"] == 0
    shift = stranger.post(
        "/api/shifts", {"station": str(world["station"].pk), "date": str(date.today())}, format="json"
    )
    assert shift.status_code == 403


def test_submit_requires_final_readings(world, make_user, client_for):
    client = client_for(make_user(stations=[world["station"]], perms=SUPERVISOR_PERMS))
    closure = open_shift(client, world, initials=("1", "1"))
    response = client.post(f"/api/closures/{closure['id']}/submit")
    assert response.status_code == 400
    assert response.data["error"]["code"] == "business_rule"


def _locked_closure(world, admin):
    client = __import__("rest_framework.test", fromlist=["APIClient"]).APIClient()
    client.force_authenticate(admin)
    data = open_and_fill(client, world)
    client.post(f"/api/closures/{data['id']}/submit")
    client.post(f"/api/closures/{data['id']}/lock")
    return Closure.objects.get(pk=data["id"])


def test_orm_guard_blocks_changes(world, admin):
    closure = _locked_closure(world, admin)
    closure.notes = "manipulado"
    with pytest.raises(ImmutableRecordError):
        closure.save()
    with pytest.raises(ImmutableRecordError):
        closure.delete()


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE closures_closure SET declared_usd = 999 WHERE id = %s",
        "DELETE FROM closures_closure WHERE id = %s",
        "UPDATE closures_meterreading SET final = 1 WHERE closure_id = %s",
        "DELETE FROM closures_closureline WHERE closure_id = %s",
    ],
)
def test_database_trigger_blocks_raw_sql(world, admin, sql):
    closure = _locked_closure(world, admin)
    with pytest.raises(DatabaseError, match="OILOWL_IMMUTABLE"):
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(sql, [str(closure.pk)])


def test_trigger_blocks_insert_into_locked_closure(world, admin):
    closure = _locked_closure(world, admin)
    with pytest.raises(DatabaseError, match="OILOWL_IMMUTABLE"):
        with transaction.atomic():
            ClosureLine.objects.create(closure=closure, method="POS", terminal=world["pos"], amount=1, currency="VES")


def test_audit_log_is_append_only(world, admin):
    _locked_closure(world, admin)
    with pytest.raises(DatabaseError, match="OILOWL_IMMUTABLE"):
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("DELETE FROM audit_auditlog")


def test_hash_chain_detects_tampering(world, admin):
    closure = _locked_closure(world, admin)
    assert services.verify_chain(world["station"].pk)["valid"] is True

    with connection.cursor() as cursor:
        # Simula a un atacante con acceso de superusuario a la BD que desactiva los triggers.
        cursor.execute("SET session_replication_role = replica")
        cursor.execute("UPDATE closures_meterreading SET liters = liters + 5 WHERE closure_id = %s", [str(closure.pk)])
        cursor.execute("SET session_replication_role = DEFAULT")

    result = services.verify_chain(world["station"].pk)
    assert result["valid"] is False
    assert result["problem"] == "contenido alterado"


def test_next_closure_suggests_previous_final(world, admin, client_for):
    client = client_for(admin)
    first = open_and_fill(client, world)
    client.post(f"/api/closures/{first['id']}/submit")
    client.post(f"/api/closures/{first['id']}/lock")
    shift = Shift.objects.get()
    client.post(f"/api/shifts/{shift.pk}/close", {"tank_readings": tank_heights(world, "99")}, format="json")

    from apps.scheduling.models import ShiftTemplate

    night = ShiftTemplate.objects.create(
        station=world["station"], code="N", name="Noche", start_time="18:00", end_time="06:00"
    )
    from apps.scheduling.models import Assignment

    Assignment.objects.create(
        date=date.today(), shift_template=night, island=world["island"], attendant=world["attendant"]
    )
    # Sin lecturas iniciales: la isla se abre sola con las finales del cierre anterior y el bombero del horario.
    closure2 = open_shift(client, world, initials=None, shift_template=str(night.pk))
    initials = {str(r["pump"]): Decimal(r["initial"]) for r in closure2["readings"]}
    assert initials[str(world["p1"].pk)] == Decimal("1100")
    assert all(not r["has_gap"] for r in closure2["readings"])
    assert str(closure2["attendant"]) == str(world["attendant"].pk)
    assert MeterReading.objects.filter(is_locked=True).count() == 2


def test_shift_needs_initials_for_pumps_without_history(world, admin, client_for):
    response = client_for(admin).post(
        "/api/shifts",
        {"station": str(world["station"].pk), "date": str(date.today()), "tank_readings": tank_heights(world)},
        format="json",
    )
    assert response.status_code == 400
    assert world["p1"].code in response.data["error"]["message"]
    assert not Shift.objects.exists()  # nada queda a medias: ni jornada ni mediciones


def _second_island(world):
    from apps.catalog.models import Island, Pump

    island = Island.objects.create(station=world["station"], name="Isla 2")
    pump = Pump.objects.create(island=island, fuel_type=world["g91"], tank=world["tank"], name="Surtidor 3")
    return island, pump


def test_islands_are_submitted_and_locked_together(world, make_user, client_for):
    _, p3 = _second_island(world)
    client = client_for(make_user(stations=[world["station"]], perms=SUPERVISOR_PERMS))
    shift = client.post(
        "/api/shifts",
        {
            "station": str(world["station"].pk),
            "date": str(date.today()),
            "tank_readings": tank_heights(world),
            "initials": {str(world["p1"].pk): "1000", str(world["p2"].pk): "2000", str(p3.pk): "500"},
        },
        format="json",
    ).data
    closures = {c.island_id: c for c in Closure.objects.filter(shift_id=shift["id"])}
    assert len(closures) == 2
    first = closures[world["island"].pk]
    second = next(c for c in closures.values() if c.pk != first.pk)
    client.patch(
        f"/api/closures/{first.pk}",
        {"readings": [{"pump": str(world["p1"].pk), "final": "1010"}, {"pump": str(world["p2"].pk), "final": "2010"}]},
        format="json",
    )

    # A la Isla 2 le falta la lectura final: no se envía ninguna.
    response = client.post(f"/api/shifts/{shift['id']}/submit-closures")
    assert response.status_code == 400
    assert "Isla 2" in response.data["error"]["message"]
    assert set(Closure.objects.values_list("status", flat=True)) == {"DRAFT"}
    # Tampoco se puede bloquear mientras haya islas en borrador.
    assert client.post(f"/api/shifts/{shift['id']}/lock-closures").status_code == 400

    client.patch(f"/api/closures/{second.pk}", {"readings": [{"pump": str(p3.pk), "final": "510"}]}, format="json")
    assert client.post(f"/api/shifts/{shift['id']}/submit-closures").status_code == 200
    assert set(Closure.objects.values_list("status", flat=True)) == {"SUBMITTED"}

    assert client.post(f"/api/shifts/{shift['id']}/lock-closures").status_code == 200
    locked = Closure.objects.order_by("chain_seq")
    assert [c.status for c in locked] == ["LOCKED", "LOCKED"]
    assert [c.chain_seq for c in locked] == [1, 2]
    assert services.verify_chain(world["station"].pk)["valid"] is True


def test_bulk_lock_requires_permission(world, make_user, client_for):
    client = client_for(make_user(stations=[world["station"]], perms=OPERATOR_PERMS))
    closure = open_and_fill(client, world)
    assert client.post(f"/api/shifts/{closure['shift']}/submit-closures").status_code == 200
    assert client.post(f"/api/shifts/{closure['shift']}/lock-closures").status_code == 403
