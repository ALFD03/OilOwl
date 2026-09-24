from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class AnonThrottle(AnonRateThrottle):
    scope = "anon"


class UserThrottle(UserRateThrottle):
    scope = "user"


class WriteThrottle(SimpleRateThrottle):
    """Límite adicional para operaciones de escritura por usuario autenticado."""

    scope = "writes"

    def get_cache_key(self, request, view):
        if request.method in SAFE_METHODS or not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class LoginThrottle(SimpleRateThrottle):
    """Por IP y por nombre de usuario, para frenar fuerza bruta distribuida."""

    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginUsernameThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "")).strip().lower() if hasattr(request, "data") else ""
        if not username:
            return None
        return self.cache_format % {"scope": "login_user", "ident": username}


class RefreshThrottle(SimpleRateThrottle):
    scope = "refresh"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
