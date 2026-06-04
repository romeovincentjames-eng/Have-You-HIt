CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'confirmed_18_plus' = 'true'
      THEN 'confirmed_18_plus'
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    gender = COALESCE(EXCLUDED.gender, public.profiles.gender);

  RETURN NEW;
END;
$$;
