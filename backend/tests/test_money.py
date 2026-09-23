from decimal import Decimal

import pytest

from apps.core import money


def test_meter_delta_normal():
    assert money.meter_delta(Decimal("1000.000"), Decimal("1250.500")) == Decimal("250.500")


def test_meter_delta_rollover():
    assert money.meter_delta(Decimal("999990"), Decimal("10"), Decimal("999999.999")) == Decimal("19.999")


def test_meter_delta_rollover_without_max_fails():
    with pytest.raises(ValueError):
        money.meter_delta(Decimal("100"), Decimal("50"))


def test_conversions_round_half_up():
    assert money.usd_to_ves(Decimal("1.005"), Decimal("100")) == Decimal("100.50")
    assert money.ves_to_usd(Decimal("1000"), Decimal("853.4993")) == Decimal("1.17")
    assert money.liters_from_usd(Decimal("-1.00"), Decimal("0.50")) == Decimal("-2.000")
