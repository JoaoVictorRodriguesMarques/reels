-- Migration: Add cover_url to scheduled_posts table
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT NULL;
