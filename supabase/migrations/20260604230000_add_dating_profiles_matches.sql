ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_target_user_id_idx ON public.posts (target_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_target_not_author'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_target_not_author
      CHECK (target_user_id IS NULL OR target_user_id <> user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.dating_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  bio TEXT CHECK (bio IS NULL OR char_length(bio) <= 500),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dating_profiles TO authenticated;
GRANT ALL ON public.dating_profiles TO service_role;

ALTER TABLE public.dating_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dating profiles viewable by authenticated"
  ON public.dating_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users create own dating profile"
  ON public.dating_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dating profile"
  ON public.dating_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own dating profile"
  ON public.dating_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.dating_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote public.vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voter_id, target_user_id),
  CHECK (voter_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS dating_votes_target_user_id_idx
  ON public.dating_votes (target_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dating_votes TO authenticated;
GRANT ALL ON public.dating_votes TO service_role;

ALTER TABLE public.dating_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dating votes"
  ON public.dating_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = voter_id OR auth.uid() = target_user_id);

CREATE POLICY "Users cast own dating votes"
  ON public.dating_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = voter_id);

CREATE POLICY "Users update own dating votes"
  ON public.dating_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = voter_id)
  WITH CHECK (auth.uid() = voter_id);

CREATE POLICY "Users delete own dating votes"
  ON public.dating_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = voter_id);

CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS matches_user_a_id_idx ON public.matches (user_a_id);
CREATE INDEX IF NOT EXISTS matches_user_b_id_idx ON public.matches (user_b_id);

GRANT SELECT ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own matches"
  ON public.matches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE TABLE IF NOT EXISTS public.match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_messages_match_id_created_at_idx
  ON public.match_messages (match_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.match_messages TO authenticated;
GRANT ALL ON public.match_messages TO service_role;

ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view messages in own matches"
  ON public.match_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = match_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Users send messages in own matches"
  ON public.match_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = match_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Users delete own match messages"
  ON public.match_messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sync_match_from_dating_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_user UUID;
  second_user UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    first_user := LEAST(OLD.voter_id, OLD.target_user_id);
    second_user := GREATEST(OLD.voter_id, OLD.target_user_id);

    DELETE FROM public.matches
    WHERE user_a_id = first_user
      AND user_b_id = second_user;

    RETURN OLD;
  END IF;

  first_user := LEAST(NEW.voter_id, NEW.target_user_id);
  second_user := GREATEST(NEW.voter_id, NEW.target_user_id);

  IF NEW.vote = 'hit'
    AND EXISTS (
      SELECT 1
      FROM public.dating_votes
      WHERE voter_id = NEW.target_user_id
        AND target_user_id = NEW.voter_id
        AND vote = 'hit'
    )
  THEN
    INSERT INTO public.matches (user_a_id, user_b_id)
    VALUES (first_user, second_user)
    ON CONFLICT (user_a_id, user_b_id) DO NOTHING;
  ELSE
    DELETE FROM public.matches
    WHERE user_a_id = first_user
      AND user_b_id = second_user;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_match_from_dating_vote_trigger ON public.dating_votes;

CREATE TRIGGER sync_match_from_dating_vote_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.dating_votes
FOR EACH ROW
EXECUTE FUNCTION public.sync_match_from_dating_vote();
