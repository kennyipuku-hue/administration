import { useEffect, useState } from "react";
import { Stethoscope, Plus, Pencil, Phone, Mail, BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Input, Select, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, fullName, generateEmployeeNumber } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Employee, Branch, EmployeeBranch } from "@/types";

export function Employees() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [filter, setFilter] = useState<"all" | "Doctor" | "Staff">("all");
  const [form, setForm] = useState({
    employee_number: "", first_name: "", surname: "", email: "", phone: "", position: "Doctor" as Employee["position"],
    department: "", branch_id: "", hpcsa_number: "", practice_number: "", status: "active",
  });
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: emp }, { data: brs }] = await Promise.all([
      supabase.from("employees").select("*").order("surname"),
      supabase.from("branches").select("*").eq("status", "active").order("branch_name"),
    ]);
    const empData = emp ?? [];
    // Load employee_branches for all
    if (empData.length > 0) {
      const { data: ebs } = await supabase.from("employee_branches").select("*, branch:branches(*)").in("employee_id", empData.map((e: Employee) => e.id));
      const ebMap = new Map<string, EmployeeBranch[]>();
      (ebs ?? []).forEach((eb: EmployeeBranch) => {
        const arr = ebMap.get(eb.employee_id) ?? [];
        arr.push(eb);
        ebMap.set(eb.employee_id, arr);
      });
      empData.forEach((e: Employee) => { e.branches = ebMap.get(e.id) ?? []; });
    }
    setEmployees(empData);
    setBranches(brs ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? employees : filter === "Doctor" ? employees.filter((e) => e.position === "Doctor") : employees.filter((e) => e.position !== "Doctor");

  function openNew() {
    setEditing(null);
    setForm({ employee_number: generateEmployeeNumber(), first_name: "", surname: "", email: "", phone: "", position: "Doctor", department: "", branch_id: "", hpcsa_number: "", practice_number: "", status: "active" });
    setBranchIds([]);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    setForm({
      employee_number: e.employee_number ?? "", first_name: e.first_name, surname: e.surname, email: e.email ?? "", phone: e.phone ?? "",
      position: e.position, department: e.department ?? "", branch_id: e.branch_id ?? "", hpcsa_number: e.hpcsa_number ?? "", practice_number: e.practice_number ?? "", status: e.status,
    });
    setBranchIds(e.branches?.map((b) => b.branch_id) ?? []);
    setError(null);
    setModalOpen(true);
  }

  function toggleBranch(id: string) {
    setBranchIds((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.first_name.trim() || !form.surname.trim()) { setError("First name and surname are required"); return; }
    setSaving(true);
    const payload = {
      employee_number: form.employee_number || null,
      first_name: form.first_name, surname: form.surname, email: form.email || null, phone: form.phone || null,
      position: form.position, department: form.department || null, branch_id: form.branch_id || null,
      hpcsa_number: form.hpcsa_number || null, practice_number: form.practice_number || null, status: form.status,
    };
    try {
      let empId: string;
      if (editing) {
        const { error: err } = await supabase.from("employees").update(payload).eq("id", editing.id);
        if (err) throw err;
        empId = editing.id;
        await logAudit("employee_updated", "employee", empId, { name: fullName(form.first_name, form.surname) });
        // Sync branches
        await supabase.from("employee_branches").delete().eq("employee_id", empId);
      } else {
        const { data, error: err } = await supabase.from("employees").insert(payload).select().single();
        if (err) throw err;
        empId = data.id;
        await logAudit("employee_created", "employee", empId, { name: fullName(form.first_name, form.surname) });
      }
      if (branchIds.length > 0) {
        await supabase.from("employee_branches").insert(branchIds.map((bid) => ({ employee_id: empId, branch_id: bid, status: "active" })));
      }
      setSaving(false);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Doctors & Staff"
        subtitle="Manage employees, doctors, and branch assignments"
        action={canEdit && <Button onClick={openNew}><Plus size={16} /> Add Employee</Button>}
      />

      <div className="mb-4 flex gap-2">
        {(["all", "Doctor", "Staff"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${filter === f ? "bg-teal-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f === "all" ? "All" : f === "Doctor" ? "Doctors" : "Staff"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<Stethoscope size={48} />} title="No employees found" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Reg. Numbers</th>
                  <th className="px-4 py-3">Branches</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{e.first_name[0]}{e.surname[0]}</div>
                        <div>
                          <p className="font-medium text-slate-900">{fullName(e.first_name, e.surname)}</p>
                          {e.email && <p className="text-xs text-slate-400">{e.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={e.position === "Doctor" ? "teal" : "slate"}>{e.position}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.department ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {e.hpcsa_number && <div>HPCSA: {e.hpcsa_number}</div>}
                      {e.practice_number && <div>Practice: {e.practice_number}</div>}
                      {!e.hpcsa_number && !e.practice_number && "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {e.branches?.map((eb) => (
                          <Badge key={eb.id} color="blue">{branches.find((b) => b.id === eb.branch_id)?.branch_code ?? "?"}</Badge>
                        )) ?? <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge color={e.status === "active" ? "green" : "slate"}>{e.status}</Badge></td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(e)} className="text-slate-400 hover:text-teal-600 transition-colors"><Pencil size={16} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Employee" : "Add Employee"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Surname" required><Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Position">
              <Select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as Employee["position"] })}>
                <option value="Doctor">Doctor</option>
                <option value="Admin">Admin</option>
                <option value="Receptionist">Receptionist</option>
                <option value="Nurse">Nurse</option>
                <option value="Staff">Staff</option>
              </Select>
            </Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="General Practice" /></Field>
          </div>
          {form.position === "Doctor" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="HPCSA Number"><Input value={form.hpcsa_number} onChange={(e) => setForm({ ...form, hpcsa_number: e.target.value })} placeholder="MP0854964" /></Field>
              <Field label="Practice Number"><Input value={form.practice_number} onChange={(e) => setForm({ ...form, practice_number: e.target.value })} placeholder="0983616" /></Field>
            </div>
          )}
          <Field label="Primary Branch">
            <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">— Select —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
            </Select>
          </Field>
          <Field label="Branch Assignments" hint="Select all branches this person works at">
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <span className="text-slate-700">{b.branch_name}</span>
                  <Badge color="slate">{b.branch_code}</Badge>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? "Save Changes" : "Create Employee"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
