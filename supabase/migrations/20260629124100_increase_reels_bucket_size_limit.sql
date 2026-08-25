-- Increase reels bucket file size limit from default 50MB to 100MB
UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'reels';
