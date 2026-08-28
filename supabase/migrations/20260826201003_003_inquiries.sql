CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  patient_email text NOT NULL,
  phone text,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Contacted','In Progress','Completed','Canceled')),
  email_status text NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending','sent','failed','not_applicable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON public.inquiries(created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inquiries" ON public.inquiries;
CREATE POLICY "select_inquiries"
ON public.inquiries FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inquiries" ON public.inquiries;
CREATE POLICY "insert_inquiries"
ON public.inquiries FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inquiries_admin" ON public.inquiries;
CREATE POLICY "update_inquiries_admin"
ON public.inquiries FOR UPDATE
TO authenticated USING (public.is_admin_or_above())
WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_inquiries_admin" ON public.inquiries;
CREATE POLICY "delete_inquiries_admin"
ON public.inquiries FOR DELETE
TO authenticated USING (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.inquiry_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  reply_message text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_status text NOT NULL DEFAULT 'sent'
    CHECK (email_status IN ('sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replies_inquiry ON public.inquiry_replies(inquiry_id);

ALTER TABLE public.inquiry_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inquiry_replies" ON public.inquiry_replies;
CREATE POLICY "select_inquiry_replies"
ON public.inquiry_replies FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inquiry_replies_admin" ON public.inquiry_replies;
CREATE POLICY "insert_inquiry_replies_admin"
ON public.inquiry_replies FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());