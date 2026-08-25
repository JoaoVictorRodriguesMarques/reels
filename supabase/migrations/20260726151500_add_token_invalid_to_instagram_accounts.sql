-- Add token_invalid column to instagram_accounts
ALTER TABLE public.instagram_accounts 
ADD COLUMN token_invalid BOOLEAN DEFAULT false;
