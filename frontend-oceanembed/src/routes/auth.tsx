import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Target,
  Brain,
  BarChart3,
  Quote,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import bg from "@/assets/plain-auth-bg.jpg.asset.json";
import { TopNav } from "@/components/ocean/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  isUsernameAvailable,
  ensureOAuthProfile,
  saveProfile,
  signInWithIdentifier,
} from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — OceanEmbed Subsurface Reconstruction" },
      {
        name: "description",
        content:
          "Sign in or create an OceanEmbed account to reconstruct subsurface ocean temperature profiles over the North Indian Ocean.",
      },
      { property: "og:title", content: "OceanEmbed — Sign in" },
      {
        property: "og:description",
        content: "Access the OceanEmbed subsurface temperature reconstruction dashboard.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "otp" | "forgot";

type FieldError = {
  identifier?: string;
  email?: string;
  username?: string;
  password?: string;
  otp?: string;
  general?: string;
};

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  // If a user lands here already signed in (including returning from
  // Google OAuth), make sure they have a profiles row, then continue.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        await ensureOAuthProfile({ data: { accessToken: data.session.access_token } });
      } catch {
        // Non-fatal: the row may already exist or be created on the next visit.
      }
      navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const clearErrors = () => setErrors({});

  const validateLogin = (): boolean => {
    const next: FieldError = {};
    if (!identifier.trim()) next.identifier = "Enter your username or email.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateSignup = (): boolean => {
    const next: FieldError = {};
    const emailTrim = email.trim();
    if (!emailTrim) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) next.email = "Enter a valid email.";

    const userTrim = username.trim();
    if (!userTrim) next.username = "Choose a username.";
    else if (userTrim.length < 3) next.username = "Username must be at least 3 characters.";
    else if (!/^[a-zA-Z0-9_.-]+$/.test(userTrim)) {
      next.username = "Use only letters, numbers, dots, hyphens or underscores.";
    }

    if (!password) next.password = "Create a password.";
    else if (password.length < 6) next.password = "Password must be at least 6 characters.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function handleGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      // The browser redirects to Google; the effect above resumes on return.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    if (!validateLogin()) return;
    setBusy(true);
    try {
      const tokens = await signInWithIdentifier({ data: { identifier, password } });
      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) throw error;
      toast.success("Signed in successfully");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not sign in.";
      setErrors({ identifier: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    if (!validateSignup()) return;
    setBusy(true);
    try {
      const { available } = await isUsernameAvailable({ data: { username } });
      if (!available) {
        setErrors({ username: "That username is already taken." });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim() },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;

      if (data.session) {
        await saveProfile({ data: { accessToken: data.session.access_token, username } });
        toast.success("Account created");
        navigate({ to: "/dashboard" });
        return;
      }

      setMode("otp");
      toast.success(`We sent a verification code to ${email.trim()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create the account.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    if (!otp.trim()) {
      setErrors({ otp: "Enter the verification code." });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "signup",
      });
      if (error || !data.session) throw error ?? new Error("That code is not valid.");
      await saveProfile({ data: { accessToken: data.session.access_token, username } });
      toast.success("Email verified — welcome aboard");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not verify that code.";
      setErrors({ otp: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    const emailTrim = email.trim();
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailTrim, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your inbox");
      setMode("login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (error) throw error;
      toast.success("New code sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const heading = useMemo(() => {
    switch (mode) {
      case "login":
        return { title: "Welcome Back", subtitle: "Login to your account and continue exploring ocean insights." };
      case "signup":
        return {
          title: "Create your account",
          subtitle: "Join OceanEmbed to explore subsurface temperature profiles.",
        };
      case "otp":
        return { title: "Verify your email", subtitle: `We sent a 6-digit code to ${email}.` };
      case "forgot":
        return { title: "Reset password", subtitle: "We will email you a secure reset link." };
    }
  }, [mode, email]);

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Plain background image */}
      <img
        src={bg.url}
        alt="Abstract dark ocean tech background"
        className="pointer-events-none fixed inset-0 size-full object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-background/60" />

      {/* Homepage navigation */}
      <TopNav />

      {/* Main content */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-4 lg:p-8">
        <div className="grid w-full max-w-7xl gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left hero */}
          <div className="flex flex-col justify-center">
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-[3.25rem]">
              Understanding Oceans. <br />
              Powered by{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AI.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
              OceanEmbed uses advanced AI models to reconstruct subsurface ocean temperatures — delivering
              accurate, real-time insights for a healthier planet.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <FeatureCard
                icon={Target}
                title="Accurate"
                description="High precision temperature data"
              />
              <FeatureCard
                icon={Brain}
                title="Intelligent"
                description="AI models for better predictions"
              />
              <FeatureCard
                icon={BarChart3}
                title="Insightful"
                description="Real-time insights for better decisions"
              />
            </div>

            <div className="mt-8 max-w-xl rounded-xl border-l-4 border-primary bg-card/60 p-5 backdrop-blur-sm">
              <Quote className="mb-2 size-5 text-accent" />
              <p className="text-sm text-muted-foreground">
                Empowering scientists, researchers, and decision-makers to protect our oceans for a
                sustainable future.
              </p>
            </div>
          </div>

          {/* Right card */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-md sm:p-8">
              <div className="text-center">
                <h2 className="font-display text-2xl font-semibold">{heading.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{heading.subtitle}</p>
              </div>

              {/* Google sign in */}
              {mode !== "otp" && mode !== "forgot" && (
                <>
                  <p className="mb-3 mt-6 text-sm font-medium">Login with Gmail</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 bg-white text-black hover:bg-white/90"
                    onClick={handleGoogle}
                    disabled={busy}
                  >
                    <svg className="size-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </Button>

                  <div className="relative my-6">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                      or
                    </span>
                  </div>
                </>
              )}

              {/* Forms */}
              {mode === "login" && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <p className="text-sm font-medium">Login with Username</p>
                  <Field
                    id="identifier"
                    label="Username or Email"
                    icon={<User className="size-4" />}
                    value={identifier}
                    onChange={(v) => {
                      setIdentifier(v);
                      if (errors.identifier) clearErrors();
                    }}
                    placeholder="Username or Email"
                    autoComplete="username"
                    error={errors.identifier}
                  />
                  <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (errors.password) clearErrors();
                    }}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    error={errors.password}
                    autoComplete="current-password"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                      />
                      <Label htmlFor="remember" className="text-xs font-normal text-muted-foreground">
                        Remember me
                      </Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        clearErrors();
                      }}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <SubmitButton busy={busy}>Login</SubmitButton>
                  <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        clearErrors();
                      }}
                      className="font-medium text-accent hover:underline"
                    >
                      Sign Up
                    </button>
                  </p>
                </form>
              )}

              {mode === "signup" && (
                <form onSubmit={handleSignup} className="space-y-4">
                  <Field
                    id="email"
                    label="Email address"
                    icon={<Mail className="size-4" />}
                    type="email"
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (errors.email) clearErrors();
                    }}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    error={errors.email}
                  />
                  <Field
                    id="username"
                    label="Username"
                    icon={<User className="size-4" />}
                    value={username}
                    onChange={(v) => {
                      setUsername(v);
                      if (errors.username) clearErrors();
                    }}
                    placeholder="argo_user"
                    autoComplete="username"
                    error={errors.username}
                  />
                  <PasswordField
                    id="new-password"
                    label="Password"
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (errors.password) clearErrors();
                    }}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    error={errors.password}
                    autoComplete="new-password"
                  />
                  <SubmitButton busy={busy}>Create account & get OTP</SubmitButton>
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        clearErrors();
                      }}
                      className="font-medium text-accent hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}

              {mode === "otp" && (
                <form onSubmit={handleVerify} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp" className="label-caps">
                      6-digit verification code
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <ShieldCheck className="size-4" />
                      </span>
                      <Input
                        id="otp"
                        value={otp}
                        onChange={(e) => {
                          setOtp(e.target.value);
                          if (errors.otp) clearErrors();
                        }}
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={10}
                        className="pl-9 text-center text-lg tracking-[0.3em]"
                      />
                    </div>
                    {errors.otp && <p className="text-xs text-destructive">{errors.otp}</p>}
                  </div>
                  <SubmitButton busy={busy}>Verify & continue</SubmitButton>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:underline"
                      onClick={() => {
                        setMode("signup");
                        clearErrors();
                      }}
                    >
                      <ArrowLeft className="size-3.5" /> Change details
                    </button>
                    <button
                      type="button"
                      className="font-medium text-accent hover:underline"
                      onClick={resend}
                      disabled={busy}
                    >
                      Resend code
                    </button>
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    The email also contains a confirmation link you can click instead.
                  </p>
                </form>
              )}

              {mode === "forgot" && (
                <form onSubmit={handleForgot} className="space-y-4">
                  <Field
                    id="reset-email"
                    label="Email address"
                    icon={<Mail className="size-4" />}
                    type="email"
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (errors.email) clearErrors();
                    }}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    error={errors.email}
                  />
                  <SubmitButton busy={busy}>Send reset link</SubmitButton>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      clearErrors();
                    }}
                    className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" /> Back to sign in
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm transition-colors hover:bg-card/70">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-accent ring-1 ring-primary/30">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "id">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`rounded-lg border-border bg-background/50 pl-9 ${error ? "border-destructive ring-1 ring-destructive" : ""}`}
          required
          {...rest}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  error?: string | undefined;
  autoComplete?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Lock className="size-4" />
        </span>
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`rounded-lg border-border bg-background/50 pl-9 pr-10 ${error ? "border-destructive ring-1 ring-destructive" : ""}`}
          required
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={busy} className="w-full gap-2 rounded-lg">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      {children}
    </Button>
  );
}
