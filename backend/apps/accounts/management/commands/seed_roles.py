"""Crea roles sugeridos. Son editables desde la aplicación y no son obligatorios."""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from apps.accounts.serializers import managed_permissions

ROLES = {
    "Administrador": None,  # todos los permisos gestionados
    "Supervisor": [
        "catalog.view_",
        "rates.",
        "scheduling.",
        "operations.",
        "closures.",
        "inventory.",
        "reports.",
        "audit.view_",
        "accounts.view_user",
    ],
    "Cajero": [
        "catalog.view_",
        "rates.view_",
        "scheduling.view_",
        "operations.view_shift",
        "operations.add_shift",
        "closures.view_closure",
        "closures.add_closure",
        "closures.change_closure",
        "closures.submit_closure",
        "inventory.view_",
        "inventory.add_tankreading",
    ],
}


class Command(BaseCommand):
    help = "Crea (o actualiza) los roles sugeridos de OilOwl"

    def handle(self, *args, **options):
        permissions = list(managed_permissions())
        for name, prefixes in ROLES.items():
            group, created = Group.objects.get_or_create(name=name)
            if prefixes is None:
                selected = permissions
            else:
                selected = [
                    p
                    for p in permissions
                    if any(f"{p.content_type.app_label}.{p.codename}".startswith(prefix) for prefix in prefixes)
                ]
            group.permissions.set(selected)
            self.stdout.write(f"{'Creado' if created else 'Actualizado'}: {name} ({len(selected)} permisos)")
