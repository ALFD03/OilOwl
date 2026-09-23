"""Permisos dinámicos: cada acción de cada viewset exige un permiso concreto.

Los permisos se asignan al usuario directamente o a través de sus roles (grupos), y
se administran desde la propia aplicación. Una acción sin permiso declarado se niega.
"""

from rest_framework.permissions import BasePermission

AUTHENTICATED = "__authenticated__"

DEFAULT_ACTION_VERBS = {
    "list": "view",
    "retrieve": "view",
    "create": "add",
    "update": "change",
    "partial_update": "change",
    "destroy": "delete",
}


def model_perm(model, verb: str) -> str:
    return f"{model._meta.app_label}.{verb}_{model._meta.model_name}"


def required_permission(view) -> str | None:
    action = getattr(view, "action", None)
    permission_map = getattr(view, "permission_map", {}) or {}
    if action in permission_map:
        return permission_map[action]
    if action == "metadata":
        return AUTHENTICATED
    verb = DEFAULT_ACTION_VERBS.get(action)
    queryset = getattr(view, "queryset", None)
    if verb and queryset is not None:
        return model_perm(queryset.model, verb)
    return None


class ActionPermission(BasePermission):
    message = "No tiene permiso para realizar esta acción."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        perm = required_permission(view)
        if perm is None:
            return False  # seguro por defecto: acción sin permiso declarado
        if perm == AUTHENTICATED:
            return True
        perms = perm if isinstance(perm, (list, tuple)) else [perm]
        return all(user.has_perm(p) for p in perms)
