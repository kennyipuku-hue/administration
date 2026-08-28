/*
# Initial schema for Medical GP Practice Management System

## Overview
Creates the complete backend for a multi-branch medical practice management
application with role-based access control (super_admin, admin, viewer).

## New Tables
1. user_profiles — links Supabase Auth users to app roles (super_admin/admin/viewer)
2. branches — practice locations (Middelburg, Noordwyk, Cape Town, Rietkuil)
3. employees — staff and doctors (HPCSA, practice numbers)
4. employee_branches — many-to-many doctor/employee ↔ branch assignments
5. patients — patient records, scoped to a branch and assigned doctor
6. patient_emergency_contacts — emergency contact per patient
7. appointments — patient appointments with doctor at a branch
8. audit_logs — immutable audit trail of privileged actions
9. system_settings — practice-wide config (operating hours, services)

## Security
- RLS enabled on every table.
- Role helpers (SECURITY DEFINER, owned by postgres) bypass RLS to avoid recursion:
  current_user_role(), is_super_admin(), is_admin_or_above().
- user_profiles.role is protected by a trigger: only super_admin can change it.
- Most read access is granted to all authenticated staff; writes require admin+.
- audit_logs: authenticated can insert; users read their own, super_admin reads all.

## Notes
- The first super_admin is created via an edge function (service role) during
  /initial-setup. No plaintext password is stored in the DB.
- Branches and the initial doctor are seeded here (non-sensitive practice data).
*/

-- ============================================================
-- USER PROFILES (table first, policies added after role helpers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  surname text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('super_admin','admin','viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROLE HELPER FUNCTIONS (SECURITY DEFINER → bypass RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    'viewer'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','admin')
      AND status = 'active'
  );
$$;

-- Now add user_profiles policies (functions exist)
DROP POLICY IF EXISTS "select_own_or_admin_profiles" ON public.user_profiles;
CREATE POLICY "select_own_or_admin_profiles"
ON public.user_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin_or_above());

DROP POLICY IF EXISTS "update_own_profile_non_role" ON public.user_profiles;
CREATE POLICY "update_own_profile_non_role"
ON public.user_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_super_admin())
WITH CHECK (auth.uid() = id OR public.is_super_admin());

-- Trigger: prevent role/status changes by non-super-admins
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
       AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can change role or status';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role ON public.user_profiles;
CREATE TRIGGER trg_protect_user_role
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_user_role();

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code text UNIQUE NOT NULL,
  branch_name text NOT NULL,
  address text,
  city text,
  province text,
  telephone text,
  email text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_branches_admin" ON public.branches;
CREATE POLICY "insert_branches_admin" ON public.branches FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_branches_admin" ON public.branches;
CREATE POLICY "update_branches_admin" ON public.branches FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_branches_superadmin" ON public.branches;
CREATE POLICY "delete_branches_superadmin" ON public.branches FOR DELETE
TO authenticated USING (public.is_super_admin());

-- ============================================================
-- EMPLOYEES (staff + doctors)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text UNIQUE,
  first_name text NOT NULL,
  surname text NOT NULL,
  email text,
  phone text,
  position text NOT NULL DEFAULT 'Staff'
    CHECK (position IN ('Doctor','Admin','Receptionist','Nurse','Staff')),
  department text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  hpcsa_number text,
  practice_number text,
  profile_image_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_employees" ON public.employees;
CREATE POLICY "select_employees" ON public.employees FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_employees_admin" ON public.employees;
CREATE POLICY "insert_employees_admin" ON public.employees FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_employees_admin" ON public.employees;
CREATE POLICY "update_employees_admin" ON public.employees FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_employees_superadmin" ON public.employees;
CREATE POLICY "delete_employees_superadmin" ON public.employees FOR DELETE
TO authenticated USING (public.is_super_admin());

-- ============================================================
-- EMPLOYEE_BRANCHES (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, branch_id)
);

ALTER TABLE public.employee_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_employee_branches" ON public.employee_branches;
CREATE POLICY "select_employee_branches" ON public.employee_branches FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_employee_branches_admin" ON public.employee_branches;
CREATE POLICY "insert_employee_branches_admin" ON public.employee_branches FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_employee_branches_admin" ON public.employee_branches;
CREATE POLICY "update_employee_branches_admin" ON public.employee_branches FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_employee_branches_admin" ON public.employee_branches;
CREATE POLICY "delete_employee_branches_admin" ON public.employee_branches FOR DELETE
TO authenticated USING (public.is_admin_or_above());

-- ============================================================
-- PATIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_number text UNIQUE,
  first_name text NOT NULL,
  surname text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('Male','Female','Other','')),
  id_number text,
  phone text,
  email text,
  address text,
  city text,
  province text,
  postal_code text,
  blood_type text,
  allergies text,
  chronic_conditions text,
  medications text,
  notes text,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  assigned_doctor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','deceased')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_branch ON public.patients(branch_id);
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON public.patients(assigned_doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(surname, first_name);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_patients" ON public.patients;
CREATE POLICY "select_patients" ON public.patients FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_patients_admin" ON public.patients;
CREATE POLICY "insert_patients_admin" ON public.patients FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_patients_admin" ON public.patients;
CREATE POLICY "update_patients_admin" ON public.patients FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_patients_superadmin" ON public.patients;
CREATE POLICY "delete_patients_superadmin" ON public.patients FOR DELETE
TO authenticated USING (public.is_super_admin());

-- ============================================================
-- PATIENT EMERGENCY CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patient_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  relationship text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_emergency_contacts" ON public.patient_emergency_contacts;
CREATE POLICY "select_emergency_contacts" ON public.patient_emergency_contacts FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_emergency_contacts_admin" ON public.patient_emergency_contacts;
CREATE POLICY "insert_emergency_contacts_admin" ON public.patient_emergency_contacts FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_emergency_contacts_admin" ON public.patient_emergency_contacts;
CREATE POLICY "update_emergency_contacts_admin" ON public.patient_emergency_contacts FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_emergency_contacts_admin" ON public.patient_emergency_contacts;
CREATE POLICY "delete_emergency_contacts_admin" ON public.patient_emergency_contacts FOR DELETE
TO authenticated USING (public.is_admin_or_above());

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  reason text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_appointments" ON public.appointments;
CREATE POLICY "select_appointments" ON public.appointments FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_appointments_admin" ON public.appointments;
CREATE POLICY "insert_appointments_admin" ON public.appointments FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "update_appointments_admin" ON public.appointments;
CREATE POLICY "update_appointments_admin" ON public.appointments FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "delete_appointments_admin" ON public.appointments;
CREATE POLICY "delete_appointments_admin" ON public.appointments FOR DELETE
TO authenticated USING (public.is_admin_or_above());

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_audit_logs" ON public.audit_logs;
CREATE POLICY "select_audit_logs" ON public.audit_logs FOR SELECT
TO authenticated
USING (auth.uid() = actor_id OR public.is_super_admin());

DROP POLICY IF EXISTS "insert_audit_logs" ON public.audit_logs;
CREATE POLICY "insert_audit_logs" ON public.audit_logs FOR INSERT
TO authenticated WITH CHECK (true);

-- ============================================================
-- SYSTEM SETTINGS (single shared practice config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name text NOT NULL DEFAULT 'MEDICAL GP — PRACTICE AND PARTNERS INC',
  practice_email text,
  practice_phone text,
  practice_address text,
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  popia_notice text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_system_settings" ON public.system_settings;
CREATE POLICY "select_system_settings" ON public.system_settings FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "update_system_settings_admin" ON public.system_settings;
CREATE POLICY "update_system_settings_admin" ON public.system_settings FOR UPDATE
TO authenticated USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "insert_system_settings_admin" ON public.system_settings;
CREATE POLICY "insert_system_settings_admin" ON public.system_settings FOR INSERT
TO authenticated WITH CHECK (public.is_admin_or_above());

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO public.branches (branch_code, branch_name, address, city, province, telephone, email)
VALUES
  ('MID', 'Middelburg Branch', 'Mc Callum and Mc Callum Street 1055', 'Middelburg', 'Mpumalanga', '060 621 4460', 'drpjcambizipartners@healthorgsolutions.co.za'),
  ('NOR', 'Noordwyk Branch', '11 Cougbrough, Noordwyk', 'Midrand', 'Gauteng', '060 621 4460', 'drpjcambizipartners@healthorgsolutions.co.za'),
  ('CPT', 'Cape Town Branch', '1st Consani Road, Elsies River', 'Cape Town', 'Western Cape', '060 621 4460', 'drpjcambizipartners@healthorgsolutions.co.za'),
  ('RIE', 'Rietkuil Branch', 'Shop No 1, Rietkuil Shopping Center, 11th Avenue', 'Rietkuil', 'Mpumalanga', '060 621 4460', 'drpjcambizipartners@healthorgsolutions.co.za')
ON CONFLICT (branch_code) DO NOTHING;

INSERT INTO public.employees (employee_number, first_name, surname, email, phone, position, department, hpcsa_number, practice_number, status)
VALUES ('EMP-0001', 'PJCA', 'Mbizi', 'drpjcambizipartners@healthorgsolutions.co.za', '013 004 1483', 'Doctor', 'General Practice', 'MP0854964', '0983616', 'active')
ON CONFLICT (employee_number) DO NOTHING;

INSERT INTO public.system_settings (practice_name, practice_email, practice_phone, practice_address, operating_hours, services, popia_notice)
VALUES (
  'MEDICAL GP — PRACTICE AND PARTNERS INC',
  'drpjcambizipartners@healthorgsolutions.co.za',
  '013 004 1483',
  'Cnr Sheba and Havelock, Mpumalanga 1300',
  '{"mon_friday":"08:00-17:00","saturday":"08:00-13:00","sunday":"Closed","public_holiday":"Closed"}'::jsonb,
  '["General Medical Consultations","Chronic Disease Management","Preventive Healthcare","Women''s Health","Child Health & Immunisations","Minor Procedures","Occupational Health","Health Screenings"]'::jsonb,
  'Patient records are confidential and managed in accordance with POPIA and relevant HPCSA requirements. Accurate patient contact details must be captured.'
)
ON CONFLICT DO NOTHING;
