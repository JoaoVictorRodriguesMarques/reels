-- 1. Add metrics and health columns to instagram_accounts
ALTER TABLE public.instagram_accounts
ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS media_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_views integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_reach integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_likes integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_comments integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_rate numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_picture_url text,
ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'healthy',
ADD COLUMN IF NOT EXISTS health_reason text,
ADD COLUMN IF NOT EXISTS last_health_check_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS metrics_updated_at timestamp with time zone;

-- 2. Add metrics columns to scheduled_posts
ALTER TABLE public.scheduled_posts
ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS reach_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ig_media_id text;

-- 3. Create account_daily_metrics table
CREATE TABLE IF NOT EXISTS public.account_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  date date NOT NULL,
  followers_count integer NOT NULL DEFAULT 0,
  total_views integer NOT NULL DEFAULT 0,
  total_reach integer NOT NULL DEFAULT 0,
  total_likes integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(instagram_account_id, date)
);

-- Enable RLS
ALTER TABLE public.account_daily_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'account_daily_metrics' AND policyname = 'Users can view their own accounts daily metrics'
  ) THEN
    CREATE POLICY "Users can view their own accounts daily metrics" ON public.account_daily_metrics
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.instagram_accounts ia
        WHERE ia.id = account_daily_metrics.instagram_account_id
        AND ia.user_id = auth.uid()
      )
    );
  END IF;
END $$;
