from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer

from .models import Assignment, ShiftTemplate


class ShiftTemplateSerializer(BaseModelSerializer):
    class Meta(BaseModelSerializer.Meta):
        model = ShiftTemplate


class AssignmentSerializer(BaseModelSerializer):
    attendant_name = serializers.CharField(source="attendant.name", read_only=True)
    island_name = serializers.CharField(source="island.name", read_only=True)
    shift_name = serializers.CharField(source="shift_template.name", read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = Assignment

    def validate(self, attrs):
        instance = Assignment(
            **{
                **(
                    {f.name: getattr(self.instance, f.name) for f in Assignment._meta.concrete_fields}
                    if self.instance
                    else {}
                ),
                **attrs,
            }
        )
        try:
            instance.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return attrs
