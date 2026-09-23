import pytest
from django.contrib.auth.models import Group, Permission
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db
HEADERS = {"HTTP_X_OILOWL_CLIENT": "web"}


def login(client, username, password="ClaveSegura#2026"):
    return client.post("/api/auth/login", {"username": username, "password": password}, format="json", **HEADERS)


def test_login_refresh_logout_cycle(make_user, station):
    make_user(stations=[station], perms=["catalog.view_station"])
    client = APIClient()
    response = login(client, "operador")
    assert response.status_code == 200
    assert "catalog.view_station" in response.data["user"]["permissions"]
    cookie = response.cookies["oilowl_refresh"]
    assert cookie["httponly"] and cookie["samesite"] == "Strict"

    refreshed = client.post("/api/auth/refresh", **HEADERS)
    assert refreshed.status_code == 200 and refreshed.data["access"]

    # El refresh anterior quedó en lista negra (rotación).
    replay = APIClient()
    replay.cookies["oilowl_refresh"] = cookie.value
    assert replay.post("/api/auth/refresh", **HEADERS).status_code == 401

    assert client.post("/api/auth/logout", **HEADERS).status_code == 204


def test_login_requires_client_header(make_user):
    make_user()
    response = APIClient().post(
        "/api/auth/login", {"username": "operador", "password": "ClaveSegura#2026"}, format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db(transaction=True)
def test_account_locks_after_failed_attempts(make_user, settings):
    """Requiere transacciones reales: el contador debe sobrevivir a las respuestas de error."""
    settings.LOGIN_MAX_FAILED_ATTEMPTS = 3
    make_user()
    client = APIClient()
    for _ in range(3):
        assert login(client, "operador", "incorrecta").status_code == 401
    assert login(client, "operador").status_code == 423


def test_login_is_rate_limited(make_user):
    make_user()
    client = APIClient()
    codes = [login(client, "nadie", "x").status_code for _ in range(6)]
    assert codes[-1] == 429


def test_passwords_hashed_with_argon2(make_user):
    user = make_user()
    assert user.password.startswith("argon2")


def test_action_without_permission_is_forbidden(make_user, client_for):
    client = client_for(make_user())
    assert client.get("/api/stations").status_code == 403


def test_cannot_grant_permissions_not_owned(make_user, client_for, station):
    manager = make_user(stations=[station], perms=["accounts.add_user", "accounts.view_user", "auth.add_group"])
    client = client_for(manager)
    escalate = client.post(
        "/api/users",
        {"username": "nuevo", "password": "ClaveSegura#2026", "permissions": ["closures.lock_closure"]},
        format="json",
    )
    assert escalate.status_code == 400
    role = client.post("/api/roles", {"name": "Poderoso", "permissions": ["closures.lock_closure"]}, format="json")
    assert role.status_code == 400
    ok = client.post(
        "/api/users",
        {
            "username": "nuevo",
            "password": "ClaveSegura#2026",
            "permissions": ["accounts.view_user"],
            "stations": [str(station.pk)],
        },
        format="json",
    )
    assert ok.status_code == 201, ok.data


def test_roles_grant_permissions_dynamically(make_user, client_for, station):
    user = make_user(stations=[station])
    role = Group.objects.create(name="Lectores")
    role.permissions.add(Permission.objects.get(codename="view_station"))
    user.groups.add(role)
    user = User.objects.get(pk=user.pk)
    assert client_for(user).get("/api/stations").status_code == 200


def test_attendant_personal_data_encrypted_at_rest(world):
    attendant = world["attendant"]
    with connection.cursor() as cursor:
        cursor.execute("SELECT national_id, phone FROM catalog_attendant WHERE id = %s", [str(attendant.pk)])
        national_id, phone = cursor.fetchone()
    assert "12345678" not in national_id and "0414" not in phone
    attendant.refresh_from_db()
    assert attendant.national_id == "V-12345678"


def test_audit_log_redacts_encrypted_fields(world, admin, client_for):
    client = client_for(admin)
    response = client.patch(f"/api/attendants/{world['attendant'].pk}", {"name": "Pedro P."}, format="json")
    assert response.status_code == 200
    from apps.audit.models import AuditLog

    log = AuditLog.objects.filter(model="attendant", action="update").latest("ts")
    assert log.after["national_id"] == "***"
