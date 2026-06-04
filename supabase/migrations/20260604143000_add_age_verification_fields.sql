ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_verification_method TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    gender,
    age_verified_at,
    age_verification_method,
    community_guidelines_agreed_at,
    community_guidelines_version
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'confirmed_18_plus' = 'true'
        OR NEW.raw_user_meta_data->>'age_verified_at' IS NOT NULL
      THEN 'confirmed_18_plus'
      ELSE NULL
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'age_verified_at' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'age_verified_at')::timestamptz
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'age_verification_method',
    CASE
      WHEN NEW.raw_user_meta_data->>'community_guidelines_agreed' = 'true'
      THEN now()
      ELSE NULL
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'community_guidelines_agreed' = 'true'
      THEN COALESCE(NEW.raw_user_meta_data->>'community_guidelines_version', '2026-06-04')
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    gender = COALESCE(EXCLUDED.gender, public.profiles.gender),
    age_verified_at = COALESCE(EXCLUDED.age_verified_at, public.profiles.age_verified_at),
    age_verification_method = COALESCE(
      EXCLUDED.age_verification_method,
      public.profiles.age_verification_method
    ),
    community_guidelines_agreed_at = COALESCE(
      EXCLUDED.community_guidelines_agreed_at,
      public.profiles.community_guidelines_agreed_at
    ),
    community_guidelines_version = COALESCE(
      EXCLUDED.community_guidelines_version,
      public.profiles.community_guidelines_version
    );

  RETURN NEW;
END;
$$;
