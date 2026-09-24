from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer

from .models import ExchangeRate


class ExchangeRateSerializer(BaseModelSerializer):
    class Meta(BaseModelSerializer.Meta):
        model = ExchangeRate
        read_only_fields = BaseModelSerializer.Meta.read_only_fields + ("source",)


class FetchRateSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
