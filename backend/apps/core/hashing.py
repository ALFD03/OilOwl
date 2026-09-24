"""Serialización canónica y cadena HMAC para evidencia de manipulación."""

import hashlib
import hmac
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.conf import settings

GENESIS = "0" * 64


def _default(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Tipo no serializable: {type(value)!r}")


def canonical_json(payload) -> str:
    return json.dumps(payload, default=_default, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def chain_hash(prev_hash: str, payload) -> str:
    message = f"{prev_hash}|{canonical_json(payload)}".encode()
    return hmac.new(settings.HASH_CHAIN_KEY.encode(), message, hashlib.sha256).hexdigest()


def verify(prev_hash: str, payload, expected: str) -> bool:
    return hmac.compare_digest(chain_hash(prev_hash, payload), expected)
