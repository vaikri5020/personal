CREATE TABLE public.alert_subscriptions (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  region text NOT NULL DEFAULT 'North Indian Ocean',
  lat double precision NOT NULL DEFAULT 15.2,
  lon double precision NOT NULL DEFAULT 88.6,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_subscriptions TO authenticated;
GRANT ALL ON public.alert_subscriptions TO service_role;

ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alert subscription"
ON public.alert_subscriptions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.disaster_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL,
  region text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  headline text NOT NULL,
  detail text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  notified_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, region, day)
);

GRANT SELECT ON public.disaster_alerts TO authenticated;
GRANT ALL ON public.disaster_alerts TO service_role;

ALTER TABLE public.disaster_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read alerts"
ON public.disaster_alerts FOR SELECT TO authenticated
USING (true);