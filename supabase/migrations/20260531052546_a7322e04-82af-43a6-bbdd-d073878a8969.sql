ALTER TABLE public.posts
  ADD COLUMN subject_name text NOT NULL DEFAULT '',
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN location_name text;

CREATE INDEX IF NOT EXISTS posts_subject_name_idx ON public.posts (lower(subject_name));
CREATE INDEX IF NOT EXISTS posts_location_idx ON public.posts (latitude, longitude);