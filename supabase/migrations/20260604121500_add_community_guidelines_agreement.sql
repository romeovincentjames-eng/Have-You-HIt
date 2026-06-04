ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_guidelines_agreed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS community_guidelines_version TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    gender,
    community_guidelines_agreed_at,
    community_guidelines_version
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'confirmed_18_plus' = 'true'
      THEN 'confirmed_18_plus'
      ELSE NULL
    END,
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
