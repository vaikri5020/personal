from django.conf import settings


class SimpleCorsMiddleware:
    """Small CORS layer for local frontend integration without extra dependencies."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS":
            from django.http import HttpResponse

            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        origins = getattr(settings, "CORS_ALLOWED_ORIGINS", [])
        origin = request.headers.get("Origin")
        if origin in origins or settings.DEBUG:
            response["Access-Control-Allow-Origin"] = origin or "*"
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRFToken"
            response["Access-Control-Allow-Credentials"] = "true"
        return response
