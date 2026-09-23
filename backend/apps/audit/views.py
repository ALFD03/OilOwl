from django.db.models import Q

from apps.core.scoping import allowed_station_ids
from apps.core.viewsets import BaseReadOnlyViewSet

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(BaseReadOnlyViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    filterset_fields = ["action", "app_label", "model", "object_id", "user", "station_id"]
    search_fields = ["object_repr", "object_id"]
    ordering_fields = ["ts"]

    def get_queryset(self):
        queryset = super().get_queryset()
        allowed = allowed_station_ids(self.request.user)
        if allowed is not None:
            queryset = queryset.filter(Q(station_id__in=allowed) | Q(station_id__isnull=True, user=self.request.user))
        return queryset
