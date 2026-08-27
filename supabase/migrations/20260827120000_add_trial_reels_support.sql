-- Add is_trial column to scheduled_posts
ALTER TABLE public.scheduled_posts 
ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- Drop and recreate grab_pending_posts_to_publish with is_trial column
DROP FUNCTION IF EXISTS public.grab_pending_posts_to_publish(integer);

CREATE OR REPLACE FUNCTION public.grab_pending_posts_to_publish(limit_count integer)
 RETURNS TABLE(
   id uuid, 
   video_url text, 
   caption text, 
   scheduled_at timestamp with time zone, 
   ig_container_id text, 
   cover_url text, 
   is_trial boolean,
   instagram_user_id text, 
   access_token text, 
   username text
 )
 LANGUAGE plpgsql
AS $func$
BEGIN
  RETURN QUERY
  WITH locked_posts AS (
    UPDATE public.scheduled_posts
    SET locked_at = now()
    WHERE scheduled_posts.id IN (
      SELECT p.id
      FROM public.scheduled_posts p
      WHERE p.status = 'pending'
        AND p.scheduled_at <= now()
        AND (p.locked_at IS NULL OR p.locked_at < now() - interval '10 minutes')
      ORDER BY p.scheduled_at ASC
      LIMIT limit_count
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  )
  SELECT 
    lp.id, 
    lp.video_url, 
    lp.caption, 
    lp.scheduled_at, 
    lp.ig_container_id, 
    lp.cover_url,
    lp.is_trial,
    ia.instagram_user_id,
    ia.access_token,
    ia.username
  FROM locked_posts lp
  JOIN public.instagram_accounts ia ON lp.instagram_account_id = ia.id;
END;
$func$;
