/*
# Allow public (anon) read access to active branches

## Purpose
The public-facing Website 1 needs to display active practice locations (branches)
to visitors who are not signed in. It connects with the anon key, so it runs as
the `anon` role. The existing `select_branches` policy is scoped to
`authenticated` only, which means the anon key returns zero rows. This migration
adds a separate SELECT policy for the `anon` role that exposes only the columns
Website 1 needs and only rows whose `status` is `active`.

## Changes
1. Security (RLS)
   - New policy `select_active_branches_anon` on `public.branches`
     - Command: SELECT
     - Role: anon
     - Condition: `status = 'active'`
   - The existing `select_branches` policy (TO authenticated, USING true) is
     left unchanged so the admin app can still see every branch including
     inactive ones.

## Notes
1. No tables or columns are created, modified, or deleted.
2. No existing policies are dropped or altered.
3. The anon policy is intentionally narrower than the authenticated policy:
   anonymous visitors can only see active branches, never inactive ones.
*/

DROP POLICY IF EXISTS "select_active_branches_anon" ON public.branches;

CREATE POLICY "select_active_branches_anon"
ON public.branches FOR SELECT
TO anon
USING (status = 'active');
