-- BB-196: Tách cột gallery_id cho activity_logs để tránh mồ côi

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS gallery_id uuid REFERENCES galleries(id) ON DELETE SET NULL;

-- Cập nhật dòng cũ
UPDATE activity_logs 
SET gallery_id = entity_id 
WHERE entity_type = 'gallery' AND gallery_id IS NULL
  AND EXISTS (SELECT 1 FROM galleries WHERE id = activity_logs.entity_id);

-- Dọn dẹp dòng mồ côi (galleries đã bị xoá trước khi có cột này)
UPDATE activity_logs
SET entity_id = NULL
WHERE entity_type = 'gallery' 
  AND entity_id IS NOT NULL
  AND gallery_id IS NULL;
CREATE OR REPLACE FUNCTION public.trg_activity_logs_gallery_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entity_type = 'gallery' THEN
      NEW.gallery_id = NEW.entity_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Nếu code update entity_id, đồng bộ sang gallery_id
    IF NEW.entity_type = 'gallery' AND NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
      NEW.gallery_id = NEW.entity_id;
    END IF;
    
    -- Nếu galleries xoá, ON DELETE SET NULL làm gallery_id thành NULL, ta nullify luôn entity_id
    IF OLD.gallery_id IS NOT NULL AND NEW.gallery_id IS NULL THEN
      NEW.entity_id = NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_activity_logs_gallery_id() FROM public, anon, authenticated;
-- Trigger functions không cần grant execute vì chúng chạy ngầm theo trigger

DROP TRIGGER IF EXISTS trg_activity_logs_gallery_id ON activity_logs;
CREATE TRIGGER trg_activity_logs_gallery_id
BEFORE INSERT OR UPDATE ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_activity_logs_gallery_id();

-- Xoá bỏ các UUID đã mồ côi (galleries đã bị xoá trước khi có cột này)
-- ON DELETE SET NULL chỉ áp dụng từ giờ về sau, nên ta dọn tàn dư:
UPDATE activity_logs
SET entity_id = NULL
WHERE entity_type = 'gallery' 
  AND entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM galleries WHERE id = activity_logs.entity_id);
