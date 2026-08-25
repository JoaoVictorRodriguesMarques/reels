
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP POLICY IF EXISTS "Public read reels" ON storage.objects;
CREATE POLICY "Public read reels by path" ON storage.objects FOR SELECT
  USING (bucket_id = 'reels' AND (storage.foldername(name))[1] IS NOT NULL);
