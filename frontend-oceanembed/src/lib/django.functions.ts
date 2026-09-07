import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Thin proxy from the Vercel server to the Django API (local dev or
 * wherever BACKEND_BASE_URL points). Keeps the browser out of CORS/CSRF
 * and keeps the Django URL server-side.
 */

const BACKEND_BASE_URL = process.env["BACKEND_BASE_URL"] ?? "http://localhost:8000";

/**
 * Ask Django whether it recognises this Supabase session. Proves the
 * frontend ↔ backend auth integration end to end.
 */
export const getDjangoAuthStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const res = await fetch(`${BACKEND_BASE_URL}/api/auth/supabase-me/`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => null)) as {
      authenticated?: boolean;
      user?: { id?: string; email?: string };
      error?: string;
    } | null;
    if (!res.ok || !body?.authenticated) {
      throw new Error(body?.error ?? "Django backend did not recognise this session.");
    }
    return { userId: body.user?.id ?? "", email: body.user?.email ?? "" };
  });

/* ------------------------------------------------------------------ */
/*  ML prediction + model info                                         */
/* ------------------------------------------------------------------ */

export interface PredictionItem {
  depth_m: number;
  temperature_c: number;
  mld_m?: number;
  heat_content_c?: number;
  z20_m?: number;
}

export interface PredictionResponse {
  mode: "ml" | "demo";
  message: string;
  location: { latitude: number; longitude: number };
  date: string;
  grid_resolution: string;
  predictions: PredictionItem[];
}

export interface ModelStatus {
  status: string;
  mode: string;
  model_name: string | null;
  weights_loaded: boolean;
  metrics_available: boolean;
}

export interface SkillMetrics {
  available: boolean;
  model_name: string | null;
  metrics: { rmse_c: number; correlation: number; bias_c: number; n_profiles: number } | null;
  per_depth: Array<{
    depth_m: number;
    rmse_c: number;
    correlation: number;
    bias_c: number;
    n: number;
  }>;
}

/**
 * POST /api/predict/ — real ML (or demo) temperature profile.
 * Falls back gracefully if Django is unreachable.
 */
export const getPredictions = createServerFn({ method: "POST" })
  .inputValidator(
    (input: unknown) =>
      z
        .object({
          accessToken: z.string().min(1),
          latitude: z.number(),
          longitude: z.number(),
          date: z.string(),
          depths: z.array(z.number()).optional(),
          surface: z
            .object({
              sst: z.number().optional(),
              sss: z.number().optional(),
              ssh_or_sla: z.number().optional(),
              current_u: z.number().optional(),
              current_v: z.number().optional(),
              wind_u: z.number().optional(),
              wind_v: z.number().optional(),
            })
            .optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const body = await fetch(`${BACKEND_BASE_URL}/api/predict/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.accessToken}`,
      },
      body: JSON.stringify({
        latitude: data.latitude,
        longitude: data.longitude,
        date: data.date,
        depths: data.depths,
        surface_observations: data.surface,
      }),
      signal: AbortSignal.timeout(15000),
    }).then(async (r) => {
      const json = (await r.json().catch(() => null)) as PredictionResponse | null;
      if (!r.ok || !json) throw new Error(json ? (json as any).error : "Backend unreachable");
      return json;
    });

    return body;
  });

/**
 * GET /api/model/status/ — is the ML model loaded?
 */
export const getModelStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const res = await fetch(`${BACKEND_BASE_URL}/api/model/status/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("Backend unreachable");
    return (await res.json()) as ModelStatus;
  });

/**
 * GET /api/metrics/ — validation skill scores.
 */
export const getMetrics = createServerFn({ method: "GET" })
  .handler(async () => {
    const res = await fetch(`${BACKEND_BASE_URL}/api/metrics/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("Backend unreachable");
    return (await res.json()) as SkillMetrics;
  });
