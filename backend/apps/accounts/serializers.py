from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from apps.catalog.models import Station
from apps.core.scoping import allowed_station_ids

from .models import StationMembership, User

MANAGED_APPS = [
    "accounts",
    "audit",
    "catalog",
    "rates",
    "scheduling",
    "operations",
    "closures",
    "inventory",
    "reports",
    "auth",
]


def perm_code(permission: Permission) -> str:
    return f"{permission.content_type.app_label}.{permission.codename}"


def managed_permissions():
    return Permission.objects.select_related("content_type").filter(content_type__app_label__in=MANAGED_APPS)


class PermissionSerializer(serializers.ModelSerializer):
    code = serializers.SerializerMethodField()
    app_label = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        model = Permission
        fields = ["id", "code", "name", "app_label", "model"]

    def get_code(self, obj) -> str:
        return perm_code(obj)


class PermissionCodeField(serializers.SlugRelatedField):
    """Permisos expresados como 'app.codigo' en la API."""

    def __init__(self, **kwargs):
        super().__init__(slug_field="codename", queryset=managed_permissions(), **kwargs)

    def to_representation(self, obj):
        return perm_code(obj)

    def to_internal_value(self, data):
        try:
            app_label, codename = str(data).split(".", 1)
            return self.get_queryset().get(content_type__app_label=app_label, codename=codename)
        except (ValueError, Permission.DoesNotExist, Permission.MultipleObjectsReturned):
            self.fail("does_not_exist", slug_name="code", value=data)


def assert_can_grant(actor: User, permissions) -> None:
    """Nadie puede otorgar permisos que no posee (evita la escalada de privilegios)."""
    if actor.is_superuser:
        return
    owned = actor.get_all_permissions()
    missing = sorted({perm_code(p) for p in permissions} - owned)
    if missing:
        raise serializers.ValidationError(
            {"permissions": f"No puede otorgar permisos que no posee: {', '.join(missing)}"}
        )


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionCodeField(many=True, required=False)
    user_count = serializers.IntegerField(source="user_set.count", read_only=True)

    class Meta:
        model = Group
        fields = ["id", "name", "permissions", "user_count"]

    def validate_permissions(self, value):
        assert_can_grant(self.context["request"].user, value)
        return value


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.PrimaryKeyRelatedField(source="groups", many=True, queryset=Group.objects.all(), required=False)
    permissions = PermissionCodeField(source="user_permissions", many=True, required=False)
    stations = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Station.objects.all(), required=False, write_only=True
    )
    station_ids = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    is_login_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "is_superuser",
            "must_change_password",
            "roles",
            "permissions",
            "stations",
            "station_ids",
            "password",
            "last_login",
            "date_joined",
            "is_login_locked",
        ]
        read_only_fields = ["is_superuser", "last_login", "date_joined"]

    def get_station_ids(self, obj) -> list[str]:
        return [str(pk) for pk in obj.station_memberships.values_list("station_id", flat=True)]

    def validate_username(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(username=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("El nombre de usuario ya existe.")
        return value

    def validate_roles(self, value):
        actor = self.context["request"].user
        perms = Permission.objects.filter(group__in=value).distinct()
        assert_can_grant(actor, perms)
        return value

    def validate_permissions(self, value):
        assert_can_grant(self.context["request"].user, value)
        return value

    def validate_stations(self, value):
        allowed = allowed_station_ids(self.context["request"].user)
        if allowed is not None and any(s.pk not in allowed for s in value):
            raise serializers.ValidationError("No puede asignar estaciones a las que no tiene acceso.")
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            validate_password(password, user=self.instance)
        elif self.instance is None:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria."})
        return attrs

    @transaction.atomic
    def _save(self, instance, validated_data):
        groups = validated_data.pop("groups", None)
        perms = validated_data.pop("user_permissions", None)
        stations = validated_data.pop("stations", None)
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        if groups is not None:
            instance.groups.set(groups)
        if perms is not None:
            instance.user_permissions.set(perms)
        if stations is not None:
            removable = instance.station_memberships.exclude(station__in=stations)
            allowed = allowed_station_ids(self.context["request"].user)
            if allowed is not None:
                removable = removable.filter(station_id__in=allowed)
            removable.delete()
            for station in stations:
                StationMembership.objects.get_or_create(user=instance, station=station)
        return instance

    def create(self, validated_data):
        return self._save(User(), validated_data)

    def update(self, instance, validated_data):
        return self._save(instance, validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=256, style={"input_type": "password"})


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(style={"input_type": "password"})
    new_password = serializers.CharField(style={"input_type": "password"})

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "La contraseña actual no es correcta."})
        validate_password(attrs["new_password"], user=user)
        return attrs


class SetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(style={"input_type": "password"})
    must_change_password = serializers.BooleanField(default=True)


class MeSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    stations = serializers.SerializerMethodField()
    roles = serializers.SlugRelatedField(source="groups", slug_field="name", many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "is_superuser",
            "must_change_password",
            "roles",
            "permissions",
            "stations",
        ]

    def get_permissions(self, obj) -> list[str]:
        return obj.effective_permissions()

    def get_stations(self, obj) -> list[dict]:
        allowed = allowed_station_ids(obj)
        qs = Station.objects.filter(is_active=True)
        if allowed is not None:
            qs = qs.filter(pk__in=allowed)
        return [{"id": str(s.pk), "code": s.code, "name": s.name} for s in qs]
