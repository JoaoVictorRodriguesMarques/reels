
-- Status enum
CREATE TYPE post_status AS ENUM ('pending', 'published', 'failed');

-- Instagram accounts table
CREATE TABLE public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, instagram_user_id)
);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ig accounts" ON public.instagram_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ig accounts" ON public.instagram_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ig accounts" ON public.instagram_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own ig accounts" ON public.instagram_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Scheduled posts table
CREATE TABLE public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status post_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own posts" ON public.scheduled_posts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own posts" ON public.scheduled_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own posts" ON public.scheduled_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own posts" ON public.scheduled_posts
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER ig_accounts_touch BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER scheduled_posts_touch BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket for reels (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('reels', 'reels', true);

CREATE POLICY "Public read reels" ON storage.objects FOR SELECT USING (bucket_id = 'reels');
CREATE POLICY "Auth users upload reels" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own reels" ON storage.objects FOR UPDATE
  USING (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own reels" ON storage.objects FOR DELETE
  USING (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);
