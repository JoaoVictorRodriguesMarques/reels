-- Migration: Add hidden column to instagram_accounts (per-user visibility)
ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
