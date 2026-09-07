import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publishableClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/**
 * Sign in with either an email address or a username, plus a password.
 * A username is resolved to its email server-side so emails are never
 * exposed to anonymous callers.
 */
export const signInWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string; password: string }) => {
    const identifier = input.identifier.trim();
    if (!identifier) throw new Error("Enter your username or email address.");
    if (!input.password) throw new Error("Enter your password.");
    return { identifier, password: input.password };
  })
  .handler(async ({ data }) => {
    let email = data.identifier;

    if (!email.includes("@")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .ilike("username", data.identifier)
        .maybeSingle();
      if (!profile) throw new Error("Invalid login details.");
      email = profile.email;
    }

    const supabase = publishableClient();
    const { data: result, error } = await supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !result.session) {
      throw new Error(
        error?.message?.toLowerCase().includes("email not confirmed")
          ? "Please verify your email with the code we sent you."
          : "Invalid login details.",
      );
    }

    return {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    };
  });

/** Check whether a username is still free (case-insensitive). */
export const isUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string }) => ({ username: input.username.trim() }))
  .handler(async ({ data }) => {
    if (data.username.length < 3) return { available: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    return { available: !existing };
  });

/** Store the chosen username for a freshly verified account. */
export const saveProfile = createServerFn({ method: "POST" })  .inputValidator((input: { accessToken: string; username: string }) => ({
    accessToken: input.accessToken,
    username: input.username.trim(),
  }))
  .handler(async ({ data }) => {
    const supabase = publishableClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(data.accessToken);
    if (userError || !userData.user) throw new Error("Session expired, please sign in again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userData.user.id,
        username: data.username,
        email: userData.user.email ?? "",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error("That username is already taken.");
    return { ok: true };
  });

/**
 * Ensure a `profiles` row exists for an OAuth (Google) sign-in.
 * Idempotent: returns the existing username when the row is present,
 * otherwise derives a unique username from the email address.
 */
export const ensureOAuthProfile = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => {
    if (!input.accessToken) throw new Error("Missing session.");
    return { accessToken: input.accessToken };
  })
  .handler(async ({ data }) => {
    const supabase = publishableClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(data.accessToken);
    if (userError || !userData.user) throw new Error("Session expired, please sign in again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (existing) return { ok: true, username: existing.username };

    const base =
      (userData.user.email?.split("@")[0] ?? "user")
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, "")
        .slice(0, 24) || "user";
    let username = base;
    for (let n = 1; n <= 99; n++) {
      const { data: clash } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (!clash) break;
      username = `${base}${n}`;
    }
    const { error } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userData.user.id,
        username,
        email: userData.user.email ?? "",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error("Could not create your profile.");
    return { ok: true, username };
  });
