class SecurityHeadersMiddleware:
    """Cabeceras de seguridad para todas las respuestas de la API."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.setdefault("Cache-Control", "no-store")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response
