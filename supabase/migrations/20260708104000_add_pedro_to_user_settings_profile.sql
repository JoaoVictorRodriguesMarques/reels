-- Migration: Update user_settings table constraint to support 'pedro' profile

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS check_profile_value;

ALTER TABLE public.user_settings
  ADD CONSTRAINT check_profile_value CHECK (meta_credential_profile IN ('guilherme', 'matheus', 'pedro'));
