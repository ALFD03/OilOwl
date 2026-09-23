from django.db import models


class Currency(models.TextChoices):
    VES = "VES", "Bolívares"
    USD = "USD", "Dólares"
