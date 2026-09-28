"""Tabla de aforo: convierte la altura medida (cm) en litros por interpolación lineal.

Cada tanque guarda sus puntos {cm, litros}. Entre dos puntos consecutivos el volumen crece
linealmente; fuera del rango de la tabla no se estima nada (se exige una medición válida).
"""

from decimal import Decimal, InvalidOperation

from apps.core.exceptions import BusinessRuleError
from apps.core.money import q_liters, to_decimal

CM = Decimal("0.01")


def normalize(points) -> list[dict]:
    """Valida y ordena la tabla. Devuelve [{"cm": "12.50", "liters": "1234.000"}, ...]."""
    if not isinstance(points, list):
        raise ValueError("La tabla de aforo debe ser una lista de puntos.")
    parsed = []
    for index, point in enumerate(points, start=1):
        try:
            cm = to_decimal(point["cm"]).quantize(CM)
            liters = q_liters(point["liters"])
        except (KeyError, TypeError, InvalidOperation) as exc:
            raise ValueError(f"Punto {index}: indique los centímetros y los litros.") from exc
        if cm < 0 or liters < 0:
            raise ValueError(f"Punto {index}: los valores no pueden ser negativos.")
        parsed.append((cm, liters))
    if not parsed:
        return []
    if len(parsed) < 2:
        raise ValueError("La tabla de aforo necesita al menos dos puntos.")
    parsed.sort()
    for (cm_a, liters_a), (cm_b, liters_b) in zip(parsed, parsed[1:], strict=False):
        if cm_a == cm_b:
            raise ValueError(f"La altura {cm_a} cm está repetida.")
        if liters_b < liters_a:
            raise ValueError(f"Los litros no pueden disminuir al subir de {cm_a} a {cm_b} cm.")
    return [{"cm": str(cm), "liters": str(liters)} for cm, liters in parsed]


def liters_at(tank, height_cm) -> Decimal:
    """Litros del tanque para una altura dada según su tabla de aforo."""
    points = [(to_decimal(p["cm"]), to_decimal(p["liters"])) for p in tank.calibration or []]
    if len(points) < 2:
        raise BusinessRuleError(
            f"El tanque {tank.code} no tiene tabla de aforo. Configúrela en Configuración › Aforo de tanques."
        )
    height = to_decimal(height_cm)
    low, high = points[0][0], points[-1][0]
    if height < low or height > high:
        raise BusinessRuleError(f"Tanque {tank.code}: la altura debe estar entre {low} y {high} cm.")
    for (cm_a, liters_a), (cm_b, liters_b) in zip(points, points[1:], strict=False):
        if cm_a <= height <= cm_b:
            return q_liters(liters_a + (liters_b - liters_a) * (height - cm_a) / (cm_b - cm_a))
    return q_liters(points[-1][1])  # inalcanzable: la altura está dentro del rango
