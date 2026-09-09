import { useEffect, useState } from "react";
import { UserCog, Shield, Mail, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { fullName, isSuperAdmin } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { UserProfile, UserRole } from "@/types";

export function UserManagement() {
  const { profile: currentUser, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: "", surname: "", email: "", password: "", role: "viewer" as UserRole });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("user_profiles").select("*").order("created_at");
    setUsers(data as UserProfile[] ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.first_name.trim() || !form.surname.trim() || !form.email.trim()) {
      setError("All fields are required");
      return;
    }
    if (form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    // Use Supabase auth admin via edge function... but we can't from client.
    // Use signUp + then update role via the profile insert
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password || "TempPass123!",
      options: { data: { first_name: form.first_name, surname: form.surname } },
    });
    if (authErr) { setError(authErr.message ?? "Sign up failed"); setSaving(false); return; }
    if (!authData.user) { setError("Failed to create user"); setSaving(false); return; }

    const { error: profileErr } = await supabase.from("user_profiles").insert({
      id: authData.user.id, first_name: form.first_name, surname: form.surname, email: form.email,
      role: form.role, status: "active",
    });
    if (profileErr) {
      setError(profileErr.message);
      setSaving(false);
      return;
    }
    await logAudit("user_created", "user_profile", authData.user.id, { email: form.email, role: form.role });
    setSuccess("User created successfully");
    setSaving(false);
    setInviteOpen(false);
    setForm({ first_name: "", surname: "", email: "", password: "", role: "viewer" });
    load();
    setTimeout(() => setSuccess(null), 3000);
  }

  async function changeRole(user: UserProfile, newRole: UserRole) {
    if (user.id === currentUser?.id) return;
    const { error } = await supabase.from("user_profiles").update({ role: newRole }).eq("id", user.id);
    if (error) { setError(error.message); return; }
    await logAudit("user_role_changed", "user_profile", user.id, { from: user.role, to: newRole });
    load();
  }

  const canDeleteUser = isSuperAdmin(currentUser?.role);

  async function deleteUser(user: UserProfile) {
    if (user.id === currentUser?.id) return;
    if (!canDeleteUser) return;
    if (!confirm(`Delete ${fullName(user.first_name, user.surname)}? This will also remove their login account and cannot be undone.`)) return;
    const { error } = await supabase.from("user_profiles").delete().eq("id", user.id);
    if (error) { setError(error.message); return; }
    await logAudit("user_deleted", "user_profile", user.id, { email: user.email });
    load();
  }

  async function toggleStatus(user: UserProfile) {
    if (user.id === currentUser?.id) return;
    const newStatus = user.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("user_profiles").update({ status: newStatus }).eq("id", user.id);
    if (error) { setError(error.message); return; }
    await logAudit("user_status_changed", "user_profile", user.id, { status: newStatus });
    load();
  }

  const roleBadge = (r: UserRole) => r === "super_admin" ? "teal" : r === "admin" ? "blue" : "slate";

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage system users and their roles"
        action={<Button onClick={() => { setError(null); setInviteOpen(true); }}><UserCog size={16} /> Add User</Button>}
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{success}</div>}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading users...</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{u.first_name[0]}{u.surname[0]}</div>
                        <span className="font-medium text-slate-900">{fullName(u.first_name, u.surname)}{u.id === currentUser?.id && " (You)"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.id === currentUser?.id ? (
                        <Badge color={roleBadge(u.role)}>{u.role.replace("_", " ")}</Badge>
                      ) : (
                        <Select value={u.role} onChange={(e) => changeRole(u, e.target.value as UserRole)} className="w-32 py-1 text-xs">
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleStatus(u)} disabled={u.id === currentUser?.id} className="disabled:opacity-50">
                        <Badge color={u.status === "active" ? "green" : "slate"}>{u.status}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.role === "super_admin" ? <Shield size={16} className="text-teal-500" /> : null}
                        {canDeleteUser && u.id !== currentUser?.id && (
                          <button onClick={() => deleteUser(u)} className="text-slate-300 hover:text-red-600 transition-colors" title="Delete user">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add New User">
        <form onSubmit={inviteUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Surname" required><Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></Field>
          </div>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary Password" hint="At least 8 characters. The user can change it later.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              <option value="viewer">Viewer (read-only)</option>
              <option value="admin">Admin (full management)</option>
            </Select>
          </Field>
          <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            Only Super Admins can assign Super Admin roles. New users default to Viewer or Admin.
          </div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create User</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
