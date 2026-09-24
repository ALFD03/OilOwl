"""Datos base: combustibles y denominaciones vigentes de Bs y USD."""

from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.catalog.models import Denomination, FuelType

FUELS = [("G91", "Gasolina 91", "#16a34a"), ("G95", "Gasolina 95", "#dc2626"), ("GOIL", "Gasoil", "#ca8a04")]
DENOMINATIONS = {
    "VES": {"BILL": ["5", "10", "20", "50", "100", "200", "500"], "COIN": ["0.50", "1"]},
    "USD": {"BILL": ["1", "2", "5", "10", "20", "50", "100"], "COIN": []},
}


class Command(BaseCommand):
    help = "Carga combustibles y denominaciones base (idempotente)"

    def handle(self, *args, **options):
        for code, name, color in FUELS:
            FuelType.objects.get_or_create(code=code, defaults={"name": name, "color": color})
        count = 0
        for currency, kinds in DENOMINATIONS.items():
            for kind, values in kinds.items():
                for value in values:
                    _, created = Denomination.objects.get_or_create(currency=currency, value=Decimal(value), kind=kind)
                    count += created
        self.stdout.write(f"Combustibles: {len(FUELS)}. Denominaciones nuevas: {count}")
