from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import Group
from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit import services as audit
from apps.core.exceptions import AccountLockedError, InvalidCredentialsError
from apps.core.permissions import AUTHENTICATED
from apps.core.scoping import allowed_station_ids
from apps.core.throttling import LoginThrottle, LoginUsernameThrottle, RefreshThrottle
from apps.core.viewsets import BaseModelViewSet, BaseReadOnlyViewSet, ContextMixin

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    PermissionSerializer,
    RoleSerializer,
    SetPasswordSerializer,
    UserSerializer,
    managed_permissions,
)

CLIENT_HEADER = "HTTP_X_OILOWL_CLIENT"


def set_refresh_cookie(response, refresh: RefreshToken) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Strict")


def require_client_header(request) -> None:
    """Las rutas que usan la cookie exigen una cabecera propia: bloquea CSRF entre sitios."""
    if request.META.get(CLIENT_HEADER) != "web":
        raise PermissionDenied("Cliente no autorizado.")


def token_response(user, refresh: RefreshToken, status_code=status.HTTP_200_OK):
    response = Response({"access": str(refresh.access_token), "user": MeSerializer(user).data}, status=status_code)
    set_refresh_cookie(response, refresh)
    return response


class LoginView(ContextMixin, APIView):
    """Se enruta fuera de la transacción de la petición (ver config/urls.py): el contador de
    intentos fallidos debe persistir aunque la respuesta sea un error."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle, LoginUsernameThrottle]

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer})
    def post(self, request):
        require_client_header(request)
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"].strip().lower()
        candidate = User.objects.filter(Q(username=username) | Q(email__iexact=username), is_active=True).first()
        if candidate and candidate.is_login_locked:
            raise AccountLockedError()
        user = authenticate(
            request,
            username=candidate.username if candidate else username,
            password=serializer.validated_data["password"],
        )
        if user is None:
            if candidate:
                with transaction.atomic():
                    candidate.register_failed_login()
                    audit.record("login_failed", candidate, user_id=candidate.pk)
            raise InvalidCredentialsError()
        user.register_successful_login()
        audit.record("login", user, user_id=user.pk)
        return token_response(user, RefreshToken.for_user(user))


@extend_schema(request=None, responses={200: MeSerializer})
class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [RefreshThrottle]

    def post(self, request):
        require_client_header(request)
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            raise InvalidCredentialsError("Sesión expirada.")
        try:
            old = RefreshToken(raw)
            user = User.objects.get(pk=old["user_id"], is_active=True)
            old.blacklist()
        except (TokenError, User.DoesNotExist, KeyError):
            response = Response(
                {"error": {"code": "session_expired", "message": "Sesión expirada.", "details": None}}, status=401
            )
            clear_refresh_cookie(response)
            return response
        return token_response(user, RefreshToken.for_user(user))


@extend_schema(request=None, responses={204: None})
class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        require_client_header(request)
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(ContextMixin, APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangePasswordView(ContextMixin, APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        audit.record("change_password", user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(BaseModelViewSet):
    queryset = User.objects.prefetch_related("groups", "user_permissions__content_type", "station_memberships")
    serializer_class = UserSerializer
    filterset_fields = ["is_active", "groups"]
    search_fields = ["username", "first_name", "last_name", "email"]
    ordering_fields = ["username", "last_login", "date_joined"]
    permission_map = {"set_password": "accounts.set_user_password", "unlock": "accounts.unlock_user"}

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        allowed = allowed_station_ids(user)
        if allowed is not None:
            queryset = queryset.filter(
                Q(pk=user.pk) | Q(station_memberships__station_id__in=allowed), is_superuser=False
            ).distinct()
        return queryset

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("No puede desactivarse a sí mismo.")
        before = audit.snapshot(instance)
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        audit.record("deactivate", instance, before=before)

    @extend_schema(request=SetPasswordSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.contrib.auth.password_validation import validate_password

        validate_password(serializer.validated_data["new_password"], user=user)
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = serializer.validated_data["must_change_password"]
        user.save(update_fields=["password", "must_change_password"])
        audit.record("set_password", user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def unlock(self, request, pk=None):
        user = self.get_object()
        User.objects.filter(pk=user.pk).update(failed_login_count=0, locked_until=None)
        audit.record("unlock", user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleViewSet(BaseModelViewSet):
    queryset = Group.objects.prefetch_related("permissions__content_type").order_by("name")
    serializer_class = RoleSerializer
    search_fields = ["name"]
    soft_delete = False


class PermissionViewSet(BaseReadOnlyViewSet):
    queryset = managed_permissions().order_by("content_type__app_label", "content_type__model", "codename")
    serializer_class = PermissionSerializer
    pagination_class = None
    search_fields = ["name", "codename"]
    permission_map = {"list": AUTHENTICATED, "retrieve": AUTHENTICATED}
