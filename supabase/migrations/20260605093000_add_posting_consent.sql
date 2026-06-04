ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS posting_consent_agreed_at TIMESTAMPTZ;

UPDATE public.profiles
SET posting_consent_agreed_at = COALESCE(posting_consent_agreed_at, created_at, now());
