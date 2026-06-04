CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('search', 'location')),
  week_start DATE NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, week_start)
);

CREATE INDEX IF NOT EXISTS usage_counters_week_start_idx
ON public.usage_counters (week_start);

GRANT SELECT, INSERT, UPDATE ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own usage counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Users insert own usage counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Users update own usage counters" ON public.usage_counters;

CREATE POLICY "Users view own usage counters"
ON public.usage_counters
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own usage counters"
ON public.usage_counters
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own usage counters"
ON public.usage_counters
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
