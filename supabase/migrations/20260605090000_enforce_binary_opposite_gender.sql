UPDATE public.profiles
SET gender = CASE
  WHEN lower(gender) IN ('man', 'men', 'male') THEN 'man'
  WHEN lower(gender) IN ('woman', 'women', 'female') THEN 'woman'
  ELSE NULL
END
WHERE gender IS NOT NULL
  AND gender NOT IN ('man', 'woman');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_gender_man_or_woman'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_man_or_woman
      CHECK (gender IS NULL OR gender IN ('man', 'woman'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.require_opposite_gender_pair(
  left_user_id UUID,
  right_user_id UUID,
  context_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  left_gender TEXT;
  right_gender TEXT;
BEGIN
  IF left_user_id IS NULL OR right_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT gender INTO left_gender
  FROM public.profiles
  WHERE id = left_user_id;

  SELECT gender INTO right_gender
  FROM public.profiles
  WHERE id = right_user_id;

  IF left_gender NOT IN ('man', 'woman') OR right_gender NOT IN ('man', 'woman') THEN
    RAISE EXCEPTION 'Both users must confirm gender before %.', context_label;
  END IF;

  IF left_gender = right_gender THEN
    RAISE EXCEPTION 'Have You Hit only allows men with women and women with men for %.', context_label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_post_opposite_gender_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_user_id IS NULL THEN
    RAISE EXCEPTION 'Main-feed posts must tag another app user.';
  END IF;

  IF NEW.target_user_id = NEW.user_id THEN
    RAISE EXCEPTION 'Main-feed posts must tag another user, not yourself.';
  END IF;

  PERFORM public.require_opposite_gender_pair(NEW.user_id, NEW.target_user_id, 'main-feed posts');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_opposite_gender_target_trigger ON public.posts;

CREATE TRIGGER enforce_post_opposite_gender_target_trigger
BEFORE INSERT OR UPDATE OF user_id, target_user_id ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_post_opposite_gender_target();

CREATE OR REPLACE FUNCTION public.enforce_dating_vote_opposite_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.voter_id = NEW.target_user_id THEN
    RAISE EXCEPTION 'You cannot vote on yourself.';
  END IF;

  PERFORM public.require_opposite_gender_pair(NEW.voter_id, NEW.target_user_id, 'dating votes');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dating_vote_opposite_gender_trigger ON public.dating_votes;

CREATE TRIGGER enforce_dating_vote_opposite_gender_trigger
BEFORE INSERT OR UPDATE OF voter_id, target_user_id ON public.dating_votes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_dating_vote_opposite_gender();

CREATE OR REPLACE FUNCTION public.enforce_match_opposite_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_opposite_gender_pair(NEW.user_a_id, NEW.user_b_id, 'matches');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_match_opposite_gender_trigger ON public.matches;

CREATE TRIGGER enforce_match_opposite_gender_trigger
BEFORE INSERT OR UPDATE OF user_a_id, user_b_id ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.enforce_match_opposite_gender();
