"""Aritmética decimal centralizada: toda cantidad monetaria o volumétrica pasa por aquí."""

from decimal import ROUND_HALF_UP, Decimal

LITERS = Decimal("0.001")
MONEY = Decimal("0.01")
RATE = Decimal("0.000001")

LITERS_FIELD = {"max_digits": 14, "decimal_places": 3}
MONEY_FIELD = {"max_digits": 18, "decimal_places": 2}
RATE_FIELD = {"max_digits": 18, "decimal_places": 6}
PRICE_FIELD = {"max_digits": 18, "decimal_places": 4}
PERCENT_FIELD = {"max_digits": 6, "decimal_places": 3}

ZERO = Decimal("0")

# Una tasa o un precio de cero anularía silenciosamente las conversiones Bs ↔ $.
MIN_RATE = Decimal("0.000001")
MIN_PRICE = Decimal("0.0001")


def to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return ZERO
    return Decimal(str(value))


def q_money(value) -> Decimal:
    return to_decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def q_liters(value) -> Decimal:
    return to_decimal(value).quantize(LITERS, rounding=ROUND_HALF_UP)


def q_rate(value) -> Decimal:
    return to_decimal(value).quantize(RATE, rounding=ROUND_HALF_UP)


def usd_to_ves(amount_usd, rate) -> Decimal:
    return q_money(to_decimal(amount_usd) * to_decimal(rate))


def ves_to_usd(amount_ves, rate) -> Decimal:
    rate = to_decimal(rate)
    if rate == 0:
        return ZERO
    return q_money(to_decimal(amount_ves) / rate)


def to_usd(amount, currency: str, rate) -> Decimal:
    return q_money(amount) if currency == "USD" else ves_to_usd(amount, rate)


def to_ves(amount, currency: str, rate) -> Decimal:
    return q_money(amount) if currency == "VES" else usd_to_ves(amount, rate)


def liters_from_usd(amount_usd, price_usd) -> Decimal:
    price = to_decimal(price_usd)
    if price == 0:
        return ZERO
    return q_liters(to_decimal(amount_usd) / price)


def meter_delta(initial, final, meter_max=None) -> Decimal:
    """Litros despachados entre dos lecturas, contemplando el reinicio del totalizador."""
    initial, final = to_decimal(initial), to_decimal(final)
    if final >= initial:
        return q_liters(final - initial)
    if meter_max is None:
        raise ValueError("La lectura final es menor que la inicial y el surtidor no tiene tope de contador")
    return q_liters(to_decimal(meter_max) - initial + final)
