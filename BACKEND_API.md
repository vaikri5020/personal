# Backend API

Base URL during development: `http://127.0.0.1:8000`

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open the built-in test frontend after starting the server:

```text
http://127.0.0.1:8000/test/
```

This page can test signup, login, logout, forgot username, forgot password, session status, and prediction APIs.

## Gmail Email Verification

The backend supports real signup email verification using Gmail SMTP.

Create a local `.env` or set these environment variables before starting Django:

```text
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=your-gmail@gmail.com
EMAIL_HOST_PASSWORD=your-gmail-app-password
DEFAULT_FROM_EMAIL=your-gmail@gmail.com
EMAIL_VERIFICATION_REQUIRED=true
```

Use a Gmail App Password, not your normal Gmail password.

Steps:

1. Enable 2-Step Verification on the Gmail account.
2. Create an App Password in Google Account security settings.
3. Put that App Password in `EMAIL_HOST_PASSWORD`.
4. Restart Django.

## Endpoints

### `GET /api/health/`

Checks if the backend is running.

Response:

```json
{
  "status": "ok",
  "service": "oceandepth-backend"
}
```

### `GET /api/model/status/`

Returns current AI/ML integration status, accepted inputs, standard depths, and region bounds.

### `GET /api/auth/csrf/`

Sets the CSRF cookie required by browser clients before calling `POST` auth or prediction APIs.

Frontend should call this once when the app starts, then send the cookie value as `X-CSRFToken` on unsafe requests.

### `POST /api/auth/send-email-otp/`

Sends a 6-digit OTP to the user's email before signup.

Rate limit: `3` attempts per IP per 15 minutes.

Request:

```json
{
  "email": "palak@example.com"
}
```

### `POST /api/auth/verify-email-otp/`

Verifies the 6-digit OTP and returns an email verification token for signup.

Rate limit: `5` attempts per IP per 15 minutes.

Request:

```json
{
  "email": "palak@example.com",
  "otp": "123456"
}
```

Response:

```json
{
  "detail": "Email verified.",
  "email_verification_token": "token-value",
  "expires_in_seconds": 1800
}
```

### `POST /api/auth/signup/`

Creates a new user and logs them in.

Rate limit: `3` signup attempts per IP per hour.

Rules:

- `username` is required.
- `username` must be `3` to `30` characters.
- `username` can contain letters, numbers, underscores, and dots.
- `email` is required.
- `email` must be valid and unique.
- `password` is required and checked by Django's password validators.
- Passwords are stored as Django password hashes, never as plain text.

Request:

```json
{
  "username": "palak",
  "email": "palak@example.com",
  "password": "StrongPassword123",
  "email_verification_token": "token-from-verify-email-otp"
}
```

### `POST /api/auth/login/`

Logs in an existing user with either username or email.

Rate limit: `5` login attempts per IP and username/email per 5 minutes.

Request:

```json
{
  "identifier": "palak@example.com",
  "password": "StrongPassword123"
}
```

`identifier` can be a username or email. `username` is still accepted for compatibility with simple frontend forms.

### `POST /api/auth/forgot-username/`

Starts username recovery using email.

Rate limit: `3` attempts per IP per hour.

Request:

```json
{
  "email": "palak@example.com"
}
```

Response is always generic so attackers cannot check whether an email is registered.

### `POST /api/auth/forgot-password/`

Starts password recovery using email.

Rate limit: `3` attempts per IP per hour.

Request:

```json
{
  "email": "palak@example.com"
}
```

Response is generic. Real email sending is not configured yet, so `email_configured` is currently `false`.

### `POST /api/auth/logout/`

Logs out the current user.

### `GET /api/auth/me/`

Returns the current logged-in user. Returns `401` if the user is not logged in.

### `GET /api/metrics/`

Returns overall and per-depth skill scores (RMSE, correlation, bias, profile counts) from `model/metrics.json`.

Response when available:

```json
{
  "available": true,
  "model_name": "OceanEmbed-ViT v1",
  "metrics": { "rmse_c": 1.23, "correlation": 0.92, "bias_c": -0.08, "n_profiles": 4521 },
  "per_depth": [
    { "depth_m": 0, "rmse_c": 0.72, "correlation": 0.99, "bias_c": 0.05, "n": 4521 }
  ],
  "validation": { "dataset": "INCOIS LAS Gridded ARGO", "period": "...", "region": "..." }
}
```

Returns `available: false` until the validation framework output is saved as `model/metrics.json`.

### `GET /api/datasets/`

Returns recommended input and target datasets from the problem statement.

### `POST /api/predict/`

Returns a depth-wise temperature profile for one location and date.

Authentication is required.

The endpoint currently uses a deterministic demo predictor so the frontend can be built and presented safely before the trained model is ready.

Request:

```json
{
  "latitude": 15.5,
  "longitude": 72.8,
  "date": "2026-01-15",
  "depths": [0, 50, 100, 200, 500, 1000],
  "surface_observations": {
    "sst": 28.4,
    "sss": 34.7,
    "ssh_or_sla": 0.12,
    "current_u": 0.2,
    "current_v": -0.1,
    "wind_u": 4.1,
    "wind_v": 1.3
  }
}
```

Response:

```json
{
  "mode": "demo",
  "message": "Replace the demo predictor with the trained AI/ML model when it is ready.",
  "location": {
    "latitude": 15.5,
    "longitude": 72.8
  },
  "date": "2026-01-15",
  "grid_resolution": "0.25 x 0.25 degree",
  "predictions": [
    {
      "depth_m": 0,
      "temperature_c": 28.81
    }
  ]
}
```

## Frontend Notes

Use these endpoints first:

- Home/dashboard load: `GET /api/health/`
- App startup auth setup: `GET /api/auth/csrf/`
- Send signup OTP: `POST /api/auth/send-email-otp/`
- Verify signup OTP: `POST /api/auth/verify-email-otp/`
- Signup page: `POST /api/auth/signup/`
- Login page: `POST /api/auth/login/`
- Forgot username page: `POST /api/auth/forgot-username/`
- Forgot password page: `POST /api/auth/forgot-password/`
- Profile/session check: `GET /api/auth/me/`
- Logout button: `POST /api/auth/logout/`
- Show model readiness: `GET /api/model/status/`
- Dataset information page: `GET /api/datasets/`
- Dive interaction: `POST /api/predict/`

For browser requests, use `credentials: "include"` so session cookies are sent.

Example frontend flow:

```js
await fetch("http://127.0.0.1:8000/api/auth/csrf/", {
  credentials: "include"
});

await fetch("http://127.0.0.1:8000/api/auth/login/", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-CSRFToken": getCookie("csrftoken")
  },
  body: JSON.stringify({ identifier, password })
});
```

## Security Notes

- Passwords are hashed by Django. Never store plain passwords.
- Signup requires valid unique email so users can recover accounts later.
- When `EMAIL_VERIFICATION_REQUIRED=true`, signup also requires a verified email token.
- CSRF protection is enabled for login, signup, logout, and prediction requests.
- Sessions use Django's signed session system.
- Login limit: `5` attempts per IP and username/email per 5 minutes.
- Signup limit: `3` attempts per IP per hour.
- Send email OTP limit: `3` attempts per IP per 15 minutes.
- Verify email OTP limit: `5` attempts per IP per 15 minutes.
- Forgot username/password limit: `3` attempts per IP per hour.
- Prediction requires login, so random users cannot freely hit the prediction endpoint.
- For free DDoS protection during hosting, put the deployed site behind Cloudflare Free if possible.
- For production, set `DJANGO_DEBUG=false`, use a strong `DJANGO_SECRET_KEY`, and use HTTPS.

## AI/ML Integration

The trained model plugs in through `api/model_service.py`. See `MODEL_INTEGRATION.md`
for the exact drop-in contract:

- Drop `model/infer.py` (+ weights) and `model/metrics.json` into the `model/` folder.
- `/api/predict/` automatically switches from demo mode to `"mode": "ml"`.
- `/api/model/status/` reports `"status": "ready"` when the model is loaded.
- `/api/metrics/` serves the validation skill scores to the analytics page.

No Django view changes are needed once the artifacts are in place. Override paths
with `OCEAN_MODEL_PATH` / `OCEAN_METRICS_PATH` when weights are stored elsewhere.
