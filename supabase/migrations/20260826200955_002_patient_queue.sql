CREATE TABLE IF NOT EXISTS public.patient_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  doctor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  queue_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','with_doctor','completed','cancelled')),
  reason text,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_branch_status ON public.patient_queue(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_date ON public.patient_queue(checked_in_at DESC);

ALTER TABLE public.patient_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_patient_queue" ON public.patient_queue;
CREATE POLICY "select_patient_queue"
ON public.patient_queue FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_patient_queue_admin" ON public.patient_queue;
CREATE POLICY "insert_patient_queue_admin"
ON public.patient_queue FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_patient_queue_admin" ON public.patient_queue;
CREATE POLICY "update_patient_queue_admin"
ON public.patient_queue FOR UPDATE
TO authenticated USING (public.is_admin_or_above())
WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_patient_queue_admin" ON public.patient_queue;
CREATE POLICY "delete_patient_queue_admin"
ON public.patient_queue FOR DELETE
TO authenticated USING (public.is_admin_or_above());