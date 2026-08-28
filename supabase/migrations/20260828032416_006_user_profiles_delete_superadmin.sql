/*
# Allow super_admin to delete user profiles

## Purpose
The User Management page now includes a delete-user action visible only to
super_admins. The user_profiles table has no DELETE policy at all — every
authenticated role is blocked from deleting. This migration adds a DELETE
policy scoped to super_admin only, so the deletion is enforced at the database
level, not just in the UI.

## Changes
1. Security (RLS)
   - New policy `delete_user_profiles_superadmin` on `public.user_profiles`
     - Command: DELETE
     - Role: authenticated
     - Condition: `public.is_super_admin()`

## Notes
1. No tables or columns are created, modified, or deleted.
2. The CASCADE on user_profiles.id → auth.users.id means deleting the profile
   row will also remove the corresponding auth.users entry, fully removing the
   user's ability to sign in.
*/

DROP POLICY IF EXISTS "delete_user_profiles_superadmin" ON public.user_profiles;

CREATE POLICY "delete_user_profiles_superadmin"
ON public.user_profiles FOR DELETE
TO authenticated
USING (public.is_super_admin());
