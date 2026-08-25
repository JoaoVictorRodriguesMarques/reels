-- Add ig_container_id to track Instagram media container during 2-phase publish
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS ig_container_id TEXT DEFAULT NULL;

-- Enable required extensions for scheduled publishing
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron job: call the publish-reels Edge Function every minute
SELECT cron.schedule(
  'publish-reels-cron',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://fzmzdodpiedpjnxyiyis.supabase.co/functions/v1/publish-reels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    )
  );
  $$
);
