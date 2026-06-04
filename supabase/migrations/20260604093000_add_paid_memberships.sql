CREATE TABLE IF NOT EXISTS public.memberships (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'incomplete',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  current_period_end TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memberships_status_idx ON public.memberships (status);
CREATE INDEX IF NOT EXISTS memberships_stripe_customer_id_idx ON public.memberships (stripe_customer_id);

GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own membership"
ON public.memberships
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
