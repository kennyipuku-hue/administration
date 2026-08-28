import { useEffect, useState } from "react";
import { Search, Eye, Pencil, Users as UsersIcon, ArrowLeft, Phone, Mail, MapPin, Heart, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Input, Select, Modal, Field, Textarea, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, formatDate, fullName, isSuperAdmin } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Patient, Branch, Employee, EmergencyContact } from "@/types";

export function Patients({ onRegister }: { onRegister: () => void }) {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const canDelete = isSuperAdmin(profile?.role);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Patient>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("patients")
      .select("*, branch:branches(*), assigned_doctor:employees!patients_assigned_doctor_id_fkey(id, first_name, surname)")
      .order("surname");
    if (error) {
      setLoadError(error.message);
    } else {
      setPatients(data as unknown as Patient[] ?? []);
    }
    const { data: brs } = await supabase.from("branches").select("*").order("branch_name");
    setBranches(brs ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = patients.filter((p) => {
    const matchesSearch = !search ||
      `${p.first_name} ${p.surname}`.toLowerCase().includes(search.toLowerCase()) ||
      p.patient_number?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search);
    const matchesBranch = !branchFilter || p.branch_id === branchFilter;
    return matchesSearch && matchesBranch;
  });

  function openDetail(p: Patient) {
    setSelected(p);
    setEditing(false);
    setEditForm({});
    // load emergency contacts
    supabase.from("patient_emergency_contacts").select("*").eq("patient_id", p.id).then(({ data }) => {
      if (selected && data) {
        setSelected({ ...selected, emergency_contacts: data as EmergencyContact[] });
      }
    });
  }

  function startEdit() {
    if (!selected) return;
    setEditForm({
      first_name: selected.first_name, surname: selected.surname, date_of_birth: selected.date_of_birth ?? "",
      gender: selected.gender, id_number: selected.id_number ?? "", phone: selected.phone ?? "", email: selected.email ?? "",
      address: selected.address ?? "", city: selected.city ?? "", province: selected.province ?? "", postal_code: selected.postal_code ?? "",
      blood_type: selected.blood_type ?? "", allergies: selected.allergies ?? "", chronic_conditions: selected.chronic_conditions ?? "",
      medications: selected.medications ?? "", notes: selected.notes ?? "", status: selected.status,
      assigned_doctor_id: selected.assigned_doctor_id ?? "",
    });
    setEditing(true);
  }

  async function deletePatient() {
    if (!selected || !canDelete) return;
    if (!confirm(`Delete ${fullName(selected.first_name, selected.surname)}? This action cannot be undone.`)) return;
    const { error } = await supabase.from("patients").delete().eq("id", selected.id);
    if (error) { setLoadError(error.message); return; }
    await logAudit("patient_deleted", "patient", selected.id, { name: fullName(selected.first_name, selected.surname) });
    setSelected(null);
    load();
  }

  async function saveEdit() {
    if (!selected) return;
    const { error } = await supabase.from("patients").update({
      first_name: editForm.first_name, surname: editForm.surname,
      date_of_birth: editForm.date_of_birth || null, gender: editForm.gender || "",
      id_number: editForm.id_number || null, phone: editForm.phone || null, email: editForm.email || null,
      address: editForm.address || null, city: editForm.city || null, province: editForm.province || null,
      postal_code: editForm.postal_code || null, blood_type: editForm.blood_type || null,
      allergies: editForm.allergies || null, chronic_conditions: editForm.chronic_conditions || null,
      medications: editForm.medications || null, notes: editForm.notes || null,
      status: editForm.status, assigned_doctor_id: editForm.assigned_doctor_id || null,
    }).eq("id", selected.id);
    if (!error) {
      await logAudit("patient_updated", "patient", selected.id, { name: fullName(selected.first_name, selected.surname) });
      setEditing(false);
      load();
      // refresh detail
      const updated = { ...selected, ...editForm };
      setSelected(updated as Patient);
    }
  }

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={`${patients.length} patient${patients.length !== 1 ? "s" : ""} registered`}
        action={canEdit && <Button onClick={onRegister}><UsersIcon size={16} /> Register Patient</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, patient number, or phone..." className="pl-9" />
        </div>
        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="sm:w-56">
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading patients...</div>
      ) : loadError ? (
        <Card><div className="p-6 text-center"><p className="text-sm text-red-600">{loadError}</p><Button className="mt-3" onClick={load}>Retry</Button></div></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<UsersIcon size={48} />} title="No patients found" description={search ? "Try adjusting your search." : "Register your first patient to get started."} action={canEdit && <Button onClick={onRegister}><UsersIcon size={16} /> Register Patient</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Patient No.</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">{p.first_name[0]}{p.surname[0]}</div>
                        <div>
                          <p className="font-medium text-slate-900">{fullName(p.first_name, p.surname)}</p>
                          {p.date_of_birth && <p className="text-xs text-slate-400">DOB: {formatDate(p.date_of_birth)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.patient_number ?? "—"}</td>
                    <td className="px-4 py-3"><Badge color="blue">{p.branch?.branch_code ?? "?"}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{p.assigned_doctor ? `Dr ${p.assigned_doctor.first_name} ${p.assigned_doctor.surname}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.phone ?? "—"}</td>
                    <td className="px-4 py-3"><Badge color={p.status === "active" ? "green" : p.status === "deceased" ? "red" : "slate"}>{p.status}</Badge></td>
                    <td className="px-4 py-3"><Eye size={16} className="text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail / Edit modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={editing ? "Edit Patient" : "Patient Details"} size="xl">
        {selected && !editing && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-700">{selected.first_name[0]}{selected.surname[0]}</div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{fullName(selected.first_name, selected.surname)}</h3>
                <div className="flex gap-2 mt-1">
                  <Badge color="blue">{selected.branch?.branch_name ?? "Unknown"}</Badge>
                  <Badge color={selected.status === "active" ? "green" : "slate"}>{selected.status}</Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Patient Number" value={selected.patient_number ?? "—"} />
              <InfoRow label="Date of Birth" value={formatDate(selected.date_of_birth)} />
              <InfoRow label="Gender" value={selected.gender || "—"} />
              <InfoRow label="ID Number" value={selected.id_number ?? "—"} />
              <InfoRow label="Phone" value={selected.phone ?? "—"} />
              <InfoRow label="Email" value={selected.email ?? "—"} />
              <InfoRow label="Address" value={[selected.address, selected.city, selected.province, selected.postal_code].filter(Boolean).join(", ") || "—"} />
              <InfoRow label="Assigned Doctor" value={selected.assigned_doctor ? `Dr ${selected.assigned_doctor.first_name} ${selected.assigned_doctor.surname}` : "—"} />
              <InfoRow label="Blood Type" value={selected.blood_type ?? "—"} />
            </div>

            {(selected.allergies || selected.chronic_conditions || selected.medications) && (
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-400">Medical Info</h4>
                {selected.allergies && <p className="text-sm"><span className="text-red-600 font-medium">Allergies:</span> {selected.allergies}</p>}
                {selected.chronic_conditions && <p className="text-sm"><span className="text-amber-600 font-medium">Chronic:</span> {selected.chronic_conditions}</p>}
                {selected.medications && <p className="text-sm"><span className="text-slate-600 font-medium">Medications:</span> {selected.medications}</p>}
              </div>
            )}

            {selected.emergency_contacts && selected.emergency_contacts.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2"><Heart size={14} className="text-red-400" /><h4 className="text-xs font-semibold uppercase text-slate-400">Emergency Contact</h4></div>
                {selected.emergency_contacts.map((ec) => (
                  <div key={ec.id} className="text-sm">
                    <p className="font-medium text-slate-700">{ec.contact_name} <span className="text-slate-400 font-normal">({ec.relationship})</span></p>
                    <p className="text-slate-500">{ec.phone} {ec.email && `· ${ec.email}`}</p>
                  </div>
                ))}
              </div>
            )}

            {selected.notes && <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400 mb-1">Notes</p><p className="text-sm text-slate-600">{selected.notes}</p></div>}

            {canEdit && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                {canDelete && (
                  <Button variant="danger" onClick={deletePatient}><Trash2 size={16} /> Delete Patient</Button>
                )}
                <Button onClick={startEdit}><Pencil size={16} /> Edit Patient</Button>
              </div>
            )}
          </div>
        )}

        {selected && editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name"><Input value={editForm.first_name ?? ""} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} /></Field>
              <Field label="Surname"><Input value={editForm.surname ?? ""} onChange={(e) => setEditForm({ ...editForm, surname: e.target.value })} /></Field>
              <Field label="Date of Birth"><Input type="date" value={editForm.date_of_birth ?? ""} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} /></Field>
              <Field label="Gender"><Select value={editForm.gender ?? ""} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as Patient["gender"] })}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></Select></Field>
              <Field label="Phone"><Input value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
              <Field label="Address"><Input value={editForm.address ?? ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></Field>
              <Field label="City"><Input value={editForm.city ?? ""} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></Field>
              <Field label="Blood Type"><Input value={editForm.blood_type ?? ""} onChange={(e) => setEditForm({ ...editForm, blood_type: e.target.value })} /></Field>
              <Field label="Status"><Select value={editForm.status ?? "active"} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Patient["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="deceased">Deceased</option></Select></Field>
            </div>
            <Field label="Allergies"><Textarea rows={2} value={editForm.allergies ?? ""} onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })} /></Field>
            <Field label="Chronic Conditions"><Textarea rows={2} value={editForm.chronic_conditions ?? ""} onChange={(e) => setEditForm({ ...editForm, chronic_conditions: e.target.value })} /></Field>
            <Field label="Medications"><Textarea rows={2} value={editForm.medications ?? ""} onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 pb-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
