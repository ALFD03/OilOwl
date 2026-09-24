from django.db import models


class Report(models.Model):
    """Modelo sin tabla: solo aloja los permisos de reportes."""

    class Meta:
        managed = False
        default_permissions = ()
        permissions = [
            ("view_dashboard", "Puede ver el dashboard"),
            ("view_sales_report", "Puede ver reportes de ventas"),
            ("view_differences_report", "Puede ver sobrantes y faltantes"),
            ("view_inventory_report", "Puede ver reportes de inventario y merma"),
        ]
