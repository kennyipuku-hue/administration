-- Add source column to inquiries
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin';

-- Replace old insert policy with admin + public policies
DROP POLICY IF EXISTS "insert_inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "insert_inquiry_public" ON public.inquiries;
DROP POLICY IF EXISTS "insert_inquiries_admin" ON public.inquiries;

CREATE POLICY "insert_inquiries_admin"
ON public.inquiries FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "insert_inquiry_public"
ON public.inquiries FOR INSERT
TO anon WITH CHECK (
  patient_name IS NOT NULL
  AND btrim(patient_name) <> ''
  AND patient_email IS NOT NULL
  AND btrim(patient_email) <> ''
  AND subject IS NOT NULL
  AND btrim(subject) <> ''
  AND message IS NOT NULL
  AND btrim(message) <> ''
  AND status = 'New'
  AND email_status = 'pending'
  AND patient_id IS NULL
  AND source = 'public'
);

-- Realtime: Add inquiries to the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'inquiries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inquiries;
  END IF;
END $$;

-- Trigger: audit log for new inquiries
CREATE OR REPLACE FUNCTION public.notify_new_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (action, entity_type, entity_id, details)
  VALUES (
    'inquiry_created',
    'inquiry',
    NEW.id,
    jsonb_build_object(
      'source', NEW.source,
      'patient_name', NEW.patient_name,
      'subject', NEW.subject,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_inquiry ON public.inquiries;
CREATE TRIGGER trg_notify_new_inquiry
  AFTER INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_inquiry();