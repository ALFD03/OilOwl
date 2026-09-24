from rest_framework import serializers

BASE_READ_ONLY = ("id", "created_at", "updated_at", "created_by", "updated_by")
LOCK_READ_ONLY = ("status", "locked_at", "locked_by", "prev_hash", "content_hash")


class BaseModelSerializer(serializers.ModelSerializer):
    """Serializer estándar: los campos de auditoría siempre son de solo lectura."""

    class Meta:
        fields = "__all__"
        read_only_fields = BASE_READ_ONLY


AUTO_CODE_READ_ONLY = BASE_READ_ONLY + ("code",)


class ImmutableOnUpdateMixin:
    """Campos que se fijan al crear y no se pueden cambiar después (`immutable_fields`)."""

    immutable_fields: tuple[str, ...] = ()

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None and not isinstance(self.instance, list):
            for name in self.immutable_fields:
                if name in fields:
                    fields[name].read_only = True
        return fields


class ChoiceDisplayField(serializers.CharField):
    def __init__(self, source_field: str, **kwargs):
        kwargs.setdefault("read_only", True)
        kwargs["source"] = f"get_{source_field}_display"
        super().__init__(**kwargs)
