"""Renumera los elementos existentes con la nomenclatura ESTACIÓN-TIPO-#### y deja las secuencias listas."""

from django.db import migrations

# Mismos prefijos que apps.core.codes (copiados: una migración no debe depender de código que cambia).
PREFIXES = [
    ("catalog", "Island", "IS", "station_id"),
    ("catalog", "Pump", "SU", "island__station_id"),
    ("inventory", "Tank", "TQ", "station_id"),
    ("catalog", "Attendant", "BO", "station_id"),
    ("scheduling", "ShiftTemplate", "TU", "station_id"),
]


def renumber(apps, schema_editor):
    Station = apps.get_model("catalog", "Station")
    CodeSequence = apps.get_model("catalog", "CodeSequence")
    PaymentTerminal = apps.get_model("catalog", "PaymentTerminal")

    for station in Station.objects.all():
        groups = [
            (apps.get_model(app, model).objects.filter(**{field: station.pk}), prefix)
            for app, model, prefix, field in PREFIXES
        ]
        groups.append((PaymentTerminal.objects.filter(station_id=station.pk, kind="POS"), "PV"))
        groups.append((PaymentTerminal.objects.filter(station_id=station.pk, kind="BIOPAGO"), "BP"))
        for queryset, prefix in groups:
            number = 0
            for number, item in enumerate(queryset.order_by("created_at", "pk"), start=1):
                item.code = f"{station.code}-{prefix}-{number:04d}"
                item.save(update_fields=["code"])
            CodeSequence.objects.update_or_create(station=station, prefix=prefix, defaults={"last": number})


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_alter_station_code_codesequence"),
        ("inventory", "0001_initial"),
        ("scheduling", "0001_initial"),
    ]

    operations = [migrations.RunPython(renumber, migrations.RunPython.noop)]
