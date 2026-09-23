from rest_framework import serializers

BASE_READ_ONLY = ("id", "created_at", "updated_at", "created_by", "updated_by")
LOCK_READ_ONLY = ("status", "locked_at", "locked_by", "prev_hash", "content_hash")


class BaseModelSerializer(serializers.ModelSerializer):
    """Serializer estándar: los campos de auditoría siempre son de solo lectura."""

    class Meta:
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY


class ChoiceDisplayField(serializers.CharField):
    def __init__(self, source_field: str, **kwargs):
        kwargs.setdefault("read_only", True)
        kwargs["source"] = f"get_{source_field}_display"
        super().__init__(**kwargs)
