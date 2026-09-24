"""Cifrado a nivel de campo (Fernet con rotación de llaves) e índices ciegos para búsquedas."""

import base64
import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.db import models


@lru_cache(maxsize=1)
def _fernet() -> MultiFernet:
    keys = settings.FIELD_ENCRYPTION_KEYS
    if not keys:
        # Solo desarrollo/pruebas: llave derivada del SECRET_KEY.
        derived = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        keys = [derived.decode()]
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("No se pudo descifrar el valor (llave inválida o dato corrupto)") from exc


def blind_index(value: str) -> str:
    """HMAC determinístico para buscar/unificar valores cifrados sin exponerlos."""
    normalized = (value or "").strip().upper()
    return hmac.new(settings.SECRET_KEY.encode(), normalized.encode(), hashlib.sha256).hexdigest()


class EncryptedTextField(models.TextField):
    """Guarda el valor cifrado en la BD y lo expone en texto plano en Python."""

    encrypted = True

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        return decrypt(value)

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value
        return encrypt(str(value))
