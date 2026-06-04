ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_verification_method TEXT,
  ADD COLUMN IF NOT EXISTS stripe_identity_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_identity_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_identity_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_identity_session_id_idx
ON public.profiles (stripe_identity_session_id)
WHERE stripe_identity_session_id IS NOT NULL;
