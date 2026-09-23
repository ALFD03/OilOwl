"""Errores de dominio y formato de error único para toda la API."""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError
from django.db.models import ProtectedError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

logger = logging.getLogger(__name__)

IMMUTABLE_DB_MARKER = "OILOWL_IMMUTABLE"


class ImmutableRecordError(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "El registro está bloqueado y no puede modificarse."
    default_code = "immutable_record"


class BusinessRuleError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "La operación viola una regla de negocio."
    default_code = "business_rule"


class InvalidStateError(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "La operación no es válida en el estado actual del registro."
    default_code = "invalid_state"


class InvalidCredentialsError(exceptions.APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Usuario o contraseña incorrectos."
    default_code = "invalid_credentials"


class AccountLockedError(exceptions.APIException):
    status_code = status.HTTP_423_LOCKED
    default_detail = "Cuenta bloqueada temporalmente por intentos fallidos."
    default_code = "account_locked"


def _translate(exc):
    if isinstance(exc, Http404):
        return exceptions.NotFound()
    if isinstance(exc, DjangoPermissionDenied):
        return exceptions.PermissionDenied()
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        return exceptions.ValidationError(detail)
    if isinstance(exc, ProtectedError):
        return InvalidStateError("No se puede eliminar: el registro está en uso. Desactívelo en su lugar.")
    if isinstance(exc, DatabaseError) and IMMUTABLE_DB_MARKER in str(exc):
        return ImmutableRecordError()
    return exc


def exception_handler(exc, context):
    exc = _translate(exc)
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Error no controlado", exc_info=exc)
        set_rollback()
        return Response(
            {"error": {"code": "server_error", "message": "Error interno del servidor.", "details": None}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    code = getattr(exc, "default_code", "error")
    if isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes
    data = response.data
    if isinstance(exc, exceptions.ValidationError):
        message, details = "Datos inválidos.", data
    else:
        message = data.get("detail", str(exc)) if isinstance(data, dict) else str(exc)
        details = None
    response.data = {"error": {"code": code, "message": str(message), "details": details}}
    return response
