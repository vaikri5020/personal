import json
import math
import secrets
from datetime import date

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from . import model_service
from .supabase_auth import supabase_jwt_required

STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
AUTH_RATE_LIMITS = {
    "login": {"limit": 5, "window_seconds": 300},
    "signup": {"limit": 3, "window_seconds": 3600},
    "send_email_otp": {"limit": 3, "window_seconds": 900},
    "verify_email_otp": {"limit": 5, "window_seconds": 900},
    "forgot_username": {"limit": 3, "window_seconds": 3600},
    "forgot_password": {"limit": 3, "window_seconds": 3600},
}
EMAIL_OTP_TTL_SECONDS = 600
EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 1800
REGION_BOUNDS = {
    "min_latitude": 5.0,
    "max_latitude": 30.0,
    "min_longitude": 45.0,
    "max_longitude": 105.0,
}


def api_index(request):
    return JsonResponse(
        {
            "service": "OceanDepth AI Backend",
            "version": "0.1.0",
            "endpoints": {
                "health": "/api/health/",
                "csrf": "/api/auth/csrf/",
                "send_email_otp": "/api/auth/send-email-otp/",
                "verify_email_otp": "/api/auth/verify-email-otp/",
                "signup": "/api/auth/signup/",
                "login": "/api/auth/login/",
                "forgot_username": "/api/auth/forgot-username/",
                "forgot_password": "/api/auth/forgot-password/",
                "logout": "/api/auth/logout/",
                "current_user": "/api/auth/me/",
                "model_status": "/api/model/status/",
                "metrics": "/api/metrics/",
                "datasets": "/api/datasets/",
                "predict": "/api/predict/",
            },
        }
    )


def test_frontend(request):
    return render(request, "api/test_frontend.html")


@require_GET
def health_check(request):
    return JsonResponse({"status": "ok", "service": "oceandepth-backend"})


@ensure_csrf_cookie
@require_GET
def csrf_token(request):
    return JsonResponse({"detail": "CSRF cookie set."})


@require_http_methods(["POST", "OPTIONS"])
def send_email_otp(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "send_email_otp")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    email = str(payload.get("email", "")).strip().lower()
    email_error = _validate_signup_email(email)
    if email_error:
        return JsonResponse({"error": email_error}, status=400)
    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        return JsonResponse(
            {"error": "Email service is not configured. Set Gmail SMTP environment variables first."},
            status=503,
        )

    otp = f"{secrets.randbelow(900000) + 100000}"
    cache.set(_email_otp_key(email), otp, timeout=EMAIL_OTP_TTL_SECONDS)
    try:
        send_mail(
            "OceanDepth AI email verification code",
            f"Your OceanDepth AI verification code is {otp}. It expires in 10 minutes.",
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
    except Exception:
        return JsonResponse({"error": "Could not send verification email. Check Gmail SMTP settings."}, status=503)

    return JsonResponse({"detail": "Verification code sent.", "expires_in_seconds": EMAIL_OTP_TTL_SECONDS})


@require_http_methods(["POST", "OPTIONS"])
def verify_email_otp(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "verify_email_otp")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    email = str(payload.get("email", "")).strip().lower()
    otp = str(payload.get("otp", "")).strip()
    email_error = _validate_signup_email(email)
    if email_error:
        return JsonResponse({"error": email_error}, status=400)
    if not otp or len(otp) != 6 or not otp.isdigit():
        return JsonResponse({"error": "Enter the 6-digit verification code."}, status=400)

    expected_otp = cache.get(_email_otp_key(email))
    if expected_otp != otp:
        return JsonResponse({"error": "Invalid or expired verification code."}, status=400)

    token = secrets.token_urlsafe(32)
    cache.delete(_email_otp_key(email))
    cache.set(_email_token_key(email), token, timeout=EMAIL_VERIFICATION_TOKEN_TTL_SECONDS)
    return JsonResponse(
        {
            "detail": "Email verified.",
            "email_verification_token": token,
            "expires_in_seconds": EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
        }
    )


@require_http_methods(["POST", "OPTIONS"])
def signup(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "signup")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    username = str(payload.get("username", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    email_verification_token = str(payload.get("email_verification_token", ""))

    if not username or not email or not password:
        return JsonResponse({"error": "username, email, and password are required."}, status=400)
    if len(username) < 3 or len(username) > 30:
        return JsonResponse({"error": "username must be between 3 and 30 characters."}, status=400)
    if not username.replace("_", "").replace(".", "").isalnum():
        return JsonResponse({"error": "username can only contain letters, numbers, underscores, and dots."}, status=400)
    email_error = _validate_signup_email(email)
    if email_error:
        return JsonResponse({"error": email_error}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"error": "This username is not available."}, status=400)
    if settings.EMAIL_VERIFICATION_REQUIRED:
        cached_token = cache.get(_email_token_key(email))
        if cached_token != email_verification_token:
            return JsonResponse({"error": "Verify your email before signing up."}, status=400)

    try:
        validate_password(password)
    except ValidationError as exc:
        return JsonResponse({"error": " ".join(exc.messages)}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    cache.delete(_email_token_key(email))
    login(request, user)
    return JsonResponse({"user": _user_payload(user)}, status=201)


@require_http_methods(["POST", "OPTIONS"])
def login_user(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "login")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    identifier = str(payload.get("identifier") or payload.get("username") or "").strip()
    password = str(payload.get("password", ""))
    username = _username_from_identifier(identifier)
    if username is None:
        return JsonResponse({"error": "Invalid username/email or password."}, status=401)

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"error": "Invalid username/email or password."}, status=401)

    login(request, user)
    return JsonResponse({"user": _user_payload(user)})


@require_http_methods(["POST", "OPTIONS"])
def forgot_username(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "forgot_username")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    email = str(payload.get("email", "")).strip().lower()
    if not email:
        return JsonResponse({"error": "email is required."}, status=400)
    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({"error": "Enter a valid email address."}, status=400)

    return JsonResponse(
        {
            "detail": "If this email is registered, username recovery instructions will be sent.",
            "email_configured": False,
        }
    )


@require_http_methods(["POST", "OPTIONS"])
def forgot_password(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    blocked_response = _rate_limited_response(request, "forgot_password")
    if blocked_response:
        return blocked_response

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    email = str(payload.get("email", "")).strip().lower()
    if not email:
        return JsonResponse({"error": "email is required."}, status=400)
    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({"error": "Enter a valid email address."}, status=400)

    return JsonResponse(
        {
            "detail": "If this email is registered, password reset instructions will be sent.",
            "email_configured": False,
        }
    )


@require_http_methods(["POST", "OPTIONS"])
def logout_user(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    logout(request)
    return JsonResponse({"detail": "Logged out successfully."})


@require_GET
def current_user(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    return JsonResponse({"authenticated": True, "user": _user_payload(request.user)})


@require_GET
def model_status(request):
    info = model_service.model_info()
    if info["mode"] == "ready":
        message = f"Model '{info['model_name']}' loaded from {info['model_dir']}. Live predictions active."
    else:
        message = (
            "No trained model found. Backend is serving deterministic demo predictions until the "
            "AIML team drops model/infer.py (and weights) — see MODEL_INTEGRATION.md."
        )
    return JsonResponse(
        {
            "status": "ready" if info["mode"] == "ready" else "mock-ready",
            "mode": info["mode"],
            "message": message,
            "model_name": info["model_name"],
            "weights_loaded": info["weights_loaded"],
            "inference_module": info["inference_module"],
            "metrics_available": info["metrics_available"],
            "input_variables": ["sst", "sss", "ssh_or_sla", "current_u", "current_v", "wind_u", "wind_v"],
            "standard_depths_m": STANDARD_DEPTHS,
            "region_bounds": REGION_BOUNDS,
        }
    )


@require_GET
def skill_metrics(request):
    payload = model_service.load_skill_metrics()
    if payload is None:
        return JsonResponse(
            {
                "available": False,
                "message": "Skill metrics not available yet. Run the validation framework and save the output to model/metrics.json.",
                "metrics": None,
                "per_depth": [],
            }
        )
    model = payload.get("model") or {}
    return JsonResponse(
        {
            "available": True,
            "message": "Skill scores computed against independent gridded ARGO observations.",
            "model_name": model.get("name"),
            "metrics": payload.get("overall"),
            "per_depth": payload.get("per_depth", []),
            "validation": payload.get("validation"),
        }
    )


@require_GET
def datasets(request):
    return JsonResponse(
        {
            "surface_inputs": [
                {"variable": "SST", "product": "OSTIA", "resolution": "0.05 degree daily"},
                {"variable": "SSS", "product": "SMAP/SMOS", "resolution": "0.125 degree daily"},
                {"variable": "SSH/SLA", "product": "DUACS", "resolution": "0.25 degree daily"},
                {"variable": "Currents", "product": "OSCAR", "resolution": "0.25 degree daily"},
                {"variable": "Winds", "product": "ASCAT/CCMP", "resolution": "0.25 degree daily"},
            ],
            "target": {"variable": "Subsurface temperature", "product": "GLORYS / Gridded ARGO"},
            "standard_grid": {"spatial_resolution": "0.25 x 0.25 degree", "temporal_resolution": "daily"},
        }
    )


@require_http_methods(["POST", "OPTIONS"])
@supabase_jwt_required
def predict_temperature(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=204)

    payload, error_response = _json_payload(request)
    if error_response:
        return error_response

    validation_error = _validate_prediction_payload(payload)
    if validation_error:
        return JsonResponse({"error": validation_error}, status=400)

    latitude = float(payload["latitude"])
    longitude = float(payload["longitude"])
    requested_depths = payload.get("depths") or STANDARD_DEPTHS
    surface = payload.get("surface_observations") or {}

    result = model_service.run_inference(
        latitude=latitude,
        longitude=longitude,
        date_iso=payload.get("date"),
        depths=requested_depths,
        surface=surface,
    )

    return JsonResponse(
        {
            "mode": result["mode"],
            "message": result["message"],
            "location": {"latitude": latitude, "longitude": longitude},
            "date": payload.get("date"),
            "grid_resolution": "0.25 x 0.25 degree",
            "predictions": result["predictions"],
        }
    )


def _validate_prediction_payload(payload):
    required_fields = ["latitude", "longitude", "date"]
    for field in required_fields:
        if field not in payload:
            return f"Missing required field: {field}."

    try:
        latitude = float(payload["latitude"])
        longitude = float(payload["longitude"])
    except (TypeError, ValueError):
        return "latitude and longitude must be numbers."

    if not REGION_BOUNDS["min_latitude"] <= latitude <= REGION_BOUNDS["max_latitude"]:
        return "latitude must be between 5 and 30 for the North Indian Ocean demo region."
    if not REGION_BOUNDS["min_longitude"] <= longitude <= REGION_BOUNDS["max_longitude"]:
        return "longitude must be between 45 and 105 for the North Indian Ocean demo region."

    try:
        date.fromisoformat(str(payload["date"]))
    except ValueError:
        return "date must use YYYY-MM-DD format."

    depths = payload.get("depths")
    if depths is not None:
        if not isinstance(depths, list) or not depths:
            return "depths must be a non-empty list of standard depth values."
        invalid_depths = [depth for depth in depths if depth not in STANDARD_DEPTHS]
        if invalid_depths:
            return f"Unsupported depths: {invalid_depths}. Use standard depths only."

    return None


def _json_payload(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"error": "Invalid JSON body."}, status=400)


def _rate_limited_response(request, action):
    config = AUTH_RATE_LIMITS[action]
    identifier = _client_ip(request)
    if action == "login":
        try:
            payload = json.loads(request.body or "{}")
            username = str(payload.get("identifier") or payload.get("username") or "").strip().lower()
        except json.JSONDecodeError:
            username = "invalid-json"
        identifier = f"{identifier}:{username}"

    cache_key = f"auth-rate:{action}:{identifier}"
    attempts = cache.get(cache_key, 0) + 1
    cache.set(cache_key, attempts, timeout=config["window_seconds"])
    if attempts > config["limit"]:
        return JsonResponse(
            {
                "error": "Too many attempts. Please try again later.",
                "retry_after_seconds": config["window_seconds"],
            },
            status=429,
        )
    return None


def _client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _username_from_identifier(identifier):
    if not identifier:
        return None
    if "@" in identifier:
        user = User.objects.filter(email__iexact=identifier.lower()).only("username").first()
        return user.username if user else None
    return identifier


def _validate_signup_email(email):
    if not email:
        return "email is required."
    try:
        validate_email(email)
    except ValidationError:
        return "Enter a valid email address."
    if User.objects.filter(email__iexact=email).exists():
        return "This email is already registered."
    return None


def _email_otp_key(email):
    return f"email-otp:{email}"


def _email_token_key(email):
    return f"email-verified:{email}"


def _user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
    }


def _demo_temperature(latitude, longitude, depth, surface):
    sst = _as_float(surface.get("sst"), 28.0)
    lat_effect = (15.0 - abs(latitude - 15.0)) * 0.03
    lon_effect = math.sin(math.radians(longitude)) * 0.4
    depth_cooling = 0.018 * depth if depth <= 300 else 5.4 + 0.004 * (depth - 300)
    temperature = sst + lat_effect + lon_effect - depth_cooling
    return round(max(2.0, temperature), 2)


def _as_float(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback
