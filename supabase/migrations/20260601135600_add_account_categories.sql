-- Migration: Add account categories with colors for better account identification

-- Categories table
CREATE TABLE public.account_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own categories" ON public.account_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own categories" ON public.account_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own categories" ON public.account_categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own categories" ON public.account_categories
  FOR DELETE USING (auth.uid() = user_id);

-- Add category_id FK to instagram_accounts (nullable, SET NULL on category deletion)
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.account_categories(id) ON DELETE SET NULL;
