"""Contexto de la petición actual (usuario, IP, agente) accesible desde modelos y servicios."""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    user_id: int | None = None
    ip: str | None = None
    user_agent: str = ""


_current: ContextVar[RequestContext] = ContextVar("oilowl_request_context", default=RequestContext())


def get_context() -> RequestContext:
    return _current.get()


def set_context(ctx: RequestContext):
    return _current.set(ctx)


def reset_context(token) -> None:
    _current.reset(token)


def current_user_id() -> int | None:
    return _current.get().user_id
