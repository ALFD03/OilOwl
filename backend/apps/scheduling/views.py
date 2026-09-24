from apps.core.viewsets import BaseModelViewSet

from .models import Assignment, ShiftTemplate
from .serializers import AssignmentSerializer, ShiftTemplateSerializer


class ShiftTemplateViewSet(BaseModelViewSet):
    queryset = ShiftTemplate.objects.all()
    serializer_class = ShiftTemplateSerializer
    ordering = ["code"]  # ESTACIÓN-TIPO-#### en orden correlativo
    station_field = "station"
    filterset_fields = ["is_active"]
    search_fields = ["code", "name"]


class AssignmentViewSet(BaseModelViewSet):
    queryset = Assignment.objects.select_related("shift_template", "island", "attendant")
    serializer_class = AssignmentSerializer
    station_field = "shift_template__station"
    filterset_fields = {
        "date": ["exact", "gte", "lte"],
        "island": ["exact"],
        "attendant": ["exact"],
        "shift_template": ["exact"],
    }
    ordering_fields = ["date"]
