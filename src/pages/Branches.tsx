import { useEffect, useState } from "react";
import { Building2, Plus, Pencil, MapPin, Phone, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Input, Select, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Branch } from "@/types";

export function Branches() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ branch_code: "", branch_name: "", address: "", city: "", province: "", telephone: "", email: "", status: "active" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("branches").select("*").order("branch_name");
    setBranches(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ branch_code: "", branch_name: "", address: "", city: "", province: "", telephone: "", email: "", status: "active" });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(b: Branch) {
    setEditing(b);
    setForm({
      branch_code: b.branch_code, branch_name: b.branch_name, address: b.address ?? "", city: b.city ?? "",
      province: b.province ?? "", telephone: b.telephone ?? "", email: b.email ?? "", status: b.status,
    });
    setError(null);
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.branch_code.trim() || !form.branch_name.trim()) {
      setError("Branch code and name are required");
      return;
    }
    setSaving(true);
    const payload = {
      branch_code: form.branch_code.toUpperCase(),
      branch_name: form.branch_name,
      address: form.address || null,
      city: form.city || null,
      province: form.province || null,
      telephone: form.telephone || null,
      email: form.email || null,
      status: form.status,
    };
    if (editing) {
      const { error: err } = await supabase.from("branches").update(payload).eq("id", editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
      await logAudit("branch_updated", "branch", editing.id, { name: form.branch_name });
    } else {
      const { error: err } = await supabase.from("branches").insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
      await logAudit("branch_created", "branch", undefined, { name: form.branch_name });
    }
    setSaving(false);
    setModalOpen(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Manage practice locations across all regions"
        action={canEdit && <Button onClick={openNew}><Plus size={16} /> Add Branch</Button>}
      />

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading branches...</div>
      ) : branches.length === 0 ? (
        <Card><EmptyState icon={<Building2 size={48} />} title="No branches found" description="Add your first practice branch to get started." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{b.branch_name}</h3>
                    <p className="text-xs text-slate-400">Code: {b.branch_code}</p>
                  </div>
                </div>
                <Badge color={b.status === "active" ? "green" : "slate"}>{b.status}</Badge>
              </div>
              <div className="space-y-1.5 text-sm text-slate-600">
                {b.address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-slate-400 shrink-0" /> <span>{b.address}{b.city ? `, ${b.city}` : ""}{b.province ? `, ${b.province}` : ""}</span></div>}
                {b.telephone && <div className="flex items-center gap-2"><Phone size={14} className="text-slate-400 shrink-0" /> {b.telephone}</div>}
                {b.email && <div className="flex items-center gap-2 text-xs"><Mail size={14} className="text-slate-400 shrink-0" /> <span className="truncate">{b.email}</span></div>}
              </div>
              {canEdit && (
                <button onClick={() => openEdit(b)} className="mt-4 flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
                  <Pencil size={14} /> Edit Branch
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Branch" : "Add Branch"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch Code" required>
              <Input value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="MID" disabled={!!editing} />
            </Field>
            <Field label="Branch Name" required>
              <Input value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} placeholder="Middelburg Branch" />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Province"><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Telephone"><Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="060 621 4460" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? "Save Changes" : "Create Branch"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
