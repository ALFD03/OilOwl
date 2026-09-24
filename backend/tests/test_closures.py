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


def open_and_fill(client, world, final_p1="1100", final_p2="2050"):
    """Abre la isla (P1 inicia en 1000, P2 en 2000) y registra finales y arqueo."""
    shift = client.post("/api/shifts", {"station": str(world["station"].pk), "date": str(date.today())}, format="json")
    assert shift.status_code == 201, shift.data
    closure = client.post(
        "/api/closures",
        {
            "shift": shift.data["id"],
            "island": str(world["island"].pk),
            "attendant": str(world["attendant"].pk),
            "initials": {str(world["p1"].pk): "1000", str(world["p2"].pk): "2000"},
        },
        format="json",
    )
    assert closure.status_code == 201, closure.data
    # Ventas: (100 + 50) L × 0.50 $ = 75 $ = 7.500 Bs a tasa 100.
    lines = [
        {"method": "CASH_USD", "denomination": str(world["usd20"].pk), "quantity": 2},  # 40 $
        {"method": "CASH_USD", "denomination": str(world["usd1"].pk), "quantity": 5},  # 5 $
        {"method": "CASH_VES", "denomination": str(world["ves100"].pk), "quantity": 10},  # 1.000 Bs
        {"method": "POS", "terminal": str(world["pos"].pk), "amount": "1500.00", "reference": "L-001"},
        {"method": "BIOPAGO", "terminal": str(world["bio"].pk), "amount": "400.00"},
    ]  # total = 45 $ + 2.900 Bs = 45 $ + 29 $ = 74 $ → faltante de 1 $
    response = client.patch(
        f"/api/closures/{closure.data['id']}",
        {
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
    shift_close = client.post(f"/api/shifts/{shift.pk}/close")
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
    shift = client.post("/api/shifts", {"station": str(world["station"].pk), "date": str(date.today())}, format="json")
    closure = client.post(
        "/api/closures",
        {
            "shift": shift.data["id"],
            "island": str(world["island"].pk),
            "initials": {str(world["p1"].pk): "1", str(world["p2"].pk): "1"},
        },
        format="json",
    )
    response = client.post(f"/api/closures/{closure.data['id']}/submit")
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
    client.post(f"/api/shifts/{shift.pk}/close")

    from apps.scheduling.models import ShiftTemplate

    night = ShiftTemplate.objects.create(
        station=world["station"], code="N", name="Noche", start_time="18:00", end_time="06:00"
    )
    shift2 = client.post(
        "/api/shifts",
        {"station": str(world["station"].pk), "date": str(date.today()), "shift_template": str(night.pk)},
        format="json",
    )
    closure2 = client.post(
        "/api/closures", {"shift": shift2.data["id"], "island": str(world["island"].pk)}, format="json"
    )
    assert closure2.status_code == 201, closure2.data
    initials = {str(r["pump"]): Decimal(r["initial"]) for r in closure2.data["readings"]}
    assert initials[str(world["p1"].pk)] == Decimal("1100")
    assert all(not r["has_gap"] for r in closure2.data["readings"])
    assert MeterReading.objects.filter(is_locked=True).count() == 2
