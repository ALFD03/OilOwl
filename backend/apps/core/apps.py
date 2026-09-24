from django.apps import AppConfig
from django.db.models.signals import post_migrate


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "Núcleo"

    def ready(self):
        from .signals import harden_public_schema

        post_migrate.connect(harden_public_schema, sender=self)
