import { useEffect, useRef, useState } from "react";
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

const [visits, setVisits] = useState<any[]>([]);
const [visitsLoading, setVisitsLoading] = useState(false);

 const [addingVisit, setAddingVisit] = useState(false);
 const [selectedVisit, setSelectedVisit] = useState<any | null>(null);
const [editingVisit, setEditingVisit] = useState(false);

  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split("T")[0],
    visit_time: "",
    doctor_id: "",
    reason_for_visit: "",
    symptoms: "",
    clinical_notes: "",
    diagnosis: "",
    treatment: "",
    follow_up: "",
    notes: "",
  });

const canvasRef = useRef<HTMLCanvasElement | null>(null);
const drawingRef = useRef(false);

const [penColor, setPenColor] = useState("#111827");
const [tool, setTool] = useState<"pen" | "eraser">("pen");

function startDrawing(e: React.PointerEvent<HTMLCanvasElement>) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  drawingRef.current = true;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();

  ctx.beginPath();
  ctx.moveTo(
    e.clientX - rect.left,
    e.clientY - rect.top
  );
}

function draw(e: React.PointerEvent<HTMLCanvasElement>) {
  if (!drawingRef.current) return;

  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();

  ctx.lineWidth = tool === "eraser" ? 12 : 2;
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = tool === "eraser" ? "#fffdf7" : penColor;

  ctx.lineTo(
    e.clientX - rect.left,
    e.clientY - rect.top
  );

  ctx.stroke();
}

function stopDrawing() {
  drawingRef.current = false;
}

function clearDrawing() {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

  const [editVisitForm, setEditVisitForm] = useState({
  visit_date: "",
  visit_time: "",
  doctor_id: "",
  reason_for_visit: "",
  symptoms: "",
  clinical_notes: "",
  diagnosis: "",
  treatment: "",
  follow_up: "",
  notes: "",
});

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

  async function openDetail(p: Patient) {
  setSelected(p);
  setEditing(false);
  setEditForm({});
  setVisits([]);
  setVisitsLoading(true);

  // Load emergency contacts
  const { data: emergencyContacts } = await supabase
    .from("patient_emergency_contacts")
    .select("*")
    .eq("patient_id", p.id);

  if (emergencyContacts) {
    setSelected({
      ...p,
      emergency_contacts: emergencyContacts as EmergencyContact[],
    });
  }

  // Load medical visit history
  const { data: visitData, error: visitError } = await supabase
    .from("patient_visits")
    .select(`
      *,
      doctor:employees(id, first_name, surname)
    `)
    .eq("patient_id", p.id)
    .order("visit_date", { ascending: false })
    .order("visit_time", { ascending: false });

  if (visitError) {
    console.error("Error loading patient visits:", visitError);
  } else {
    setVisits(visitData ?? []);
  }

  setVisitsLoading(false);
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

  async function saveVisit() {
  if (!selected) return;

  const { data, error } = await supabase
    .from("patient_visits")
    .insert({
      patient_id: selected.id,
      visit_date: visitForm.visit_date,
      visit_time: visitForm.visit_time || null,
      doctor_id: visitForm.doctor_id || null,
      reason_for_visit: visitForm.reason_for_visit || null,
      symptoms: visitForm.symptoms || null,
      clinical_notes: visitForm.clinical_notes || null,
      diagnosis: visitForm.diagnosis || null,
      treatment: visitForm.treatment || null,
      follow_up: visitForm.follow_up || null,
      notes: visitForm.notes || null,
      handwriting_data: canvasRef.current?.toDataURL("image/png") || null,
      status: "completed",
    })
    .select(`
      *,
      doctor:employees(id, first_name, surname)
    `)
    .single();

  if (error) {
    console.error("Error saving visit:", error);
    setLoadError(error.message);
    return;
  }

  if (data) {
    setVisits((current) => [data, ...current]);
  }

  setVisitForm({
    visit_date: new Date().toISOString().split("T")[0],
    visit_time: "",
    doctor_id: "",
    reason_for_visit: "",
    symptoms: "",
    clinical_notes: "",
    diagnosis: "",
    treatment: "",
    follow_up: "",
    notes: "",
  });

  setAddingVisit(false);
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
            {/* Medical History */}
<div className="rounded-lg border border-slate-200 p-4">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h4 className="text-sm font-semibold text-slate-800">
        Medical History
      </h4>
      <p className="text-xs text-slate-400 mt-1">
        {visits.length} visit{visits.length !== 1 ? "s" : ""} recorded
      </p>
    </div>

    {canEdit && (
      <Button
  onClick={() => {
    setVisitForm({
      visit_date: new Date().toISOString().split("T")[0],
      visit_time: "",
      doctor_id: selected?.assigned_doctor_id ?? "",
      reason_for_visit: "",
      symptoms: "",
      clinical_notes: "",
      diagnosis: "",
      treatment: "",
      follow_up: "",
      notes: "",
    });

    setAddingVisit(true);
  }}
>
  + Add Visit Record
</Button>
    )}
  </div>
{addingVisit && (
  <div className="rounded-xl border border-slate-200 bg-[#f8f5ed] p-5 shadow-sm">
    {/* Paper header */}
    <div className="mb-5 border-b border-slate-300 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-serif text-xl font-semibold text-slate-800">
            Clinical Visit Notes
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            {selected
              ? `${fullName(selected.first_name, selected.surname)} · ${selected.patient_number ?? "No patient number"}`
              : "Patient"}
          </p>
        </div>

        <div className="text-right text-xs text-slate-500">
          <div>
            Date:{" "}
            <strong className="text-slate-700">
              {visitForm.visit_date}
            </strong>
          </div>
          {visitForm.visit_time && (
            <div className="mt-1">
              Time:{" "}
              <strong className="text-slate-700">
                {visitForm.visit_time}
              </strong>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Basic visit information */}
    <div className="mb-5 grid gap-4 sm:grid-cols-2">
      <Field label="Visit Date">
        <Input
          type="date"
          value={visitForm.visit_date}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              visit_date: e.target.value,
            })
          }
        />
      </Field>

      <Field label="Visit Time">
        <Input
          type="time"
          value={visitForm.visit_time}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              visit_time: e.target.value,
            })
          }
        />
      </Field>

      <Field label="Doctor">
        <Select
          value={visitForm.doctor_id}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              doctor_id: e.target.value,
            })
          }
        >
          <option value="">Select doctor</option>

          {selected?.assigned_doctor && (
            <option value={selected.assigned_doctor.id}>
              Dr {selected.assigned_doctor.first_name}{" "}
              {selected.assigned_doctor.surname}
            </option>
          )}
        </Select>
      </Field>

      <Field label="Reason for Visit">
        <Input
          value={visitForm.reason_for_visit}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              reason_for_visit: e.target.value,
            })
          }
          placeholder="Reason for consultation..."
        />
      </Field>
    </div>
{/* Writing toolbar */}
<div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
  <span className="mr-2 text-xs font-semibold uppercase text-slate-400">
    Pen
  </span>

  <button
    type="button"
    onClick={() => {
      setTool("pen");
      setPenColor("#111827");
    }}
    className={`flex h-9 w-9 items-center justify-center rounded-md border ${
      tool === "pen" && penColor === "#111827"
        ? "border-slate-900 bg-slate-100"
        : "border-slate-200"
    }`}
    title="Black pen"
  >
    <span className="h-4 w-4 rounded-full bg-slate-900" />
  </button>

  <button
    type="button"
    onClick={() => {
      setTool("pen");
      setPenColor("#2563eb");
    }}
    className={`flex h-9 w-9 items-center justify-center rounded-md border ${
      tool === "pen" && penColor === "#2563eb"
        ? "border-blue-600 bg-blue-50"
        : "border-slate-200"
    }`}
    title="Blue pen"
  >
    <span className="h-4 w-4 rounded-full bg-blue-600" />
  </button>

  <button
    type="button"
    onClick={() => {
      setTool("pen");
      setPenColor("#dc2626");
    }}
    className={`flex h-9 w-9 items-center justify-center rounded-md border ${
      tool === "pen" && penColor === "#dc2626"
        ? "border-red-600 bg-red-50"
        : "border-slate-200"
    }`}
    title="Red pen"
  >
    <span className="h-4 w-4 rounded-full bg-red-600" />
  </button>

  <div className="mx-1 h-6 w-px bg-slate-200" />

  <button
    type="button"
    onClick={() => setTool("eraser")}
    className={`rounded-md border px-3 py-2 text-xs font-medium ${
      tool === "eraser"
        ? "border-slate-400 bg-slate-100 text-slate-800"
        : "border-slate-200 text-slate-500"
    }`}
  >
    Eraser
  </button>

  <button
    type="button"
    onClick={clearDrawing}
    className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-600"
  >
    Clear
  </button>
</div>
    {/* Paper writing area */}
    <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-[#fffdf7] shadow-inner">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, #d9dee5 32px)",
        }}
      />

      <div className="relative p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-serif text-sm font-semibold text-slate-700">
            Doctor's Notes
          </span>

          <button
            type="button"
            onClick={clearDrawing}
            className="text-xs font-medium text-slate-500 hover:text-red-600"
          >
            Clear handwriting
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          className="block h-[500px] w-full touch-none cursor-crosshair"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>
    </div>

    {/* Typed clinical information */}
    <div className="mt-6 space-y-4">
      <Field label="Symptoms / Patient Complaint">
        <Textarea
          rows={3}
          value={visitForm.symptoms}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              symptoms: e.target.value,
            })
          }
          placeholder="Patient complaint or symptoms..."
        />
      </Field>

      <Field label="Diagnosis">
        <Textarea
          rows={2}
          value={visitForm.diagnosis}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              diagnosis: e.target.value,
            })
          }
          placeholder="Diagnosis..."
        />
      </Field>

      <Field label="Treatment / Medication">
        <Textarea
          rows={3}
          value={visitForm.treatment}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              treatment: e.target.value,
            })
          }
          placeholder="Treatment, medication, dosage..."
        />
      </Field>

      <Field label="Follow-up Instructions">
        <Textarea
          rows={3}
          value={visitForm.follow_up}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              follow_up: e.target.value,
            })
          }
          placeholder="Follow-up instructions..."
        />
      </Field>

      <Field label="Additional Notes">
        <Textarea
          rows={2}
          value={visitForm.notes}
          onChange={(e) =>
            setVisitForm({
              ...visitForm,
              notes: e.target.value,
            })
          }
          placeholder="Additional notes..."
        />
      </Field>
    </div>

    {/* Actions */}
    <div className="mt-6 flex justify-end gap-2 border-t border-slate-300 pt-4">
      <Button
        variant="secondary"
        onClick={() => setAddingVisit(false)}
      >
        Cancel
      </Button>

      <Button onClick={saveVisit}>
        Save Visit Record
      </Button>
    </div>
  </div>
)}
  {visitsLoading ? (
    <div className="py-6 text-center text-sm text-slate-400">
      Loading medical history...
    </div>
  ) : visits.length === 0 ? (
    <div className="rounded-lg bg-slate-50 p-6 text-center">
      <p className="text-sm text-slate-500">
        No visit records yet.
      </p>
      {canEdit && (
        <p className="text-xs text-slate-400 mt-1">
          Add a visit record when this patient is seen.
        </p>
      )}
    </div>
  ) : (
    <div className="space-y-3">
      {visits.map((visit) => (
        <div
          key={visit.id}
          className="rounded-lg border border-slate-100 bg-slate-50 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-slate-800">
                {visit.reason_for_visit || "General Consultation"}
              </p>

              <p className="text-xs text-slate-500 mt-1">
                {visit.visit_date}
                {visit.visit_time ? ` · ${visit.visit_time}` : ""}
              </p>

              <p className="text-xs text-slate-500 mt-1">
                Doctor:{" "}
                {visit.doctor
                  ? `Dr ${visit.doctor.first_name} ${visit.doctor.surname}`
                  : "Not assigned"}
              </p>
            </div>

            {visit.status && (
              <Badge
                color={
                  visit.status === "completed"
                    ? "green"
                    : visit.status === "cancelled"
                    ? "red"
                    : "slate"
                }
              >
                {visit.status}
              </Badge>
            )}
          </div>

          {visit.diagnosis && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-400">
                Diagnosis
              </p>
              <p className="text-sm text-slate-600">
                {visit.diagnosis}
              </p>
            </div>
          )}

          {visit.clinical_notes && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-400">
                Clinical Notes
              </p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {visit.clinical_notes}
              </p>
            </div>
          )}
          <div className="mt-4 flex justify-end">
  <Button
    variant="secondary"
    onClick={() => {
      setSelectedVisit(visit);
      setEditingVisit(false);
      setEditVisitForm({
        visit_date: visit.visit_date ?? "",
        visit_time: visit.visit_time ?? "",
        doctor_id: visit.doctor_id ?? "",
        reason_for_visit: visit.reason_for_visit ?? "",
        symptoms: visit.symptoms ?? "",
        clinical_notes: visit.clinical_notes ?? "",
        diagnosis: visit.diagnosis ?? "",
        treatment: visit.treatment ?? "",
        follow_up: visit.follow_up ?? "",
        notes: visit.notes ?? "",
      });
    }}
  >
    <Eye size={15} /> View
  </Button>
</div>
        </div>
      ))}
    </div>
  )}
</div>

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

      {/* Visit Details / Edit Modal */}
      <Modal
        open={!!selectedVisit}
        onClose={() => {
          setSelectedVisit(null);
          setEditingVisit(false);
        }}
        title={editingVisit ? "Edit Visit Record" : "Visit Details"}
        size="xl"
      >
        {selectedVisit && (
          <div className="space-y-4">

            {!editingVisit ? (
              <>
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoRow
                      label="Visit Date"
                      value={selectedVisit.visit_date || "—"}
                    />

                    <InfoRow
                      label="Visit Time"
                      value={selectedVisit.visit_time || "—"}
                    />

                    <InfoRow
                      label="Doctor"
                      value={
                        selectedVisit.doctor
                          ? `Dr ${selectedVisit.doctor.first_name} ${selectedVisit.doctor.surname}`
                          : "Not assigned"
                      }
                    />

                    <InfoRow
                      label="Status"
                      value={selectedVisit.status || "—"}
                    />
                  </div>
                </div>

                <div className="space-y-4">

                  {selectedVisit.handwriting_data && (
  <div>
    <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
      Doctor's Handwritten Notes
    </p>

    <div className="overflow-hidden rounded-lg border border-slate-300 bg-[#fffdf7] shadow-inner">
      <img
        src={selectedVisit.handwriting_data}
        alt="Doctor's handwritten notes"
        className="block w-full"
      />
    </div>
  </div>
)}

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Reason for Visit
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.reason_for_visit || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Symptoms / Patient Complaint
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.symptoms || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Clinical Notes
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.clinical_notes || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Diagnosis
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.diagnosis || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Treatment / Medication
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.treatment || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Follow-up Instructions
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.follow_up || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Additional Notes
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedVisit.notes || "—"}
                    </p>
                  </div>

                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedVisit(null)}
                  >
                    Close
                  </Button>

                  {canEdit && (
                    <Button
                      onClick={() => setEditingVisit(true)}
                    >
                      <Pencil size={16} />
                      Edit Visit
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">

                <div className="grid gap-4 sm:grid-cols-2">

                  <Field label="Visit Date">
                    <Input
                      type="date"
                      value={editVisitForm.visit_date}
                      onChange={(e) =>
                        setEditVisitForm({
                          ...editVisitForm,
                          visit_date: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Visit Time">
                    <Input
                      type="time"
                      value={editVisitForm.visit_time}
                      onChange={(e) =>
                        setEditVisitForm({
                          ...editVisitForm,
                          visit_time: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Doctor">
                    <Select
                      value={editVisitForm.doctor_id}
                      onChange={(e) =>
                        setEditVisitForm({
                          ...editVisitForm,
                          doctor_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Select doctor</option>

                      {selected?.assigned_doctor && (
                        <option value={selected.assigned_doctor.id}>
                          Dr {selected.assigned_doctor.first_name}{" "}
                          {selected.assigned_doctor.surname}
                        </option>
                      )}
                    </Select>
                  </Field>

                  <Field label="Reason for Visit">
                    <Input
                      value={editVisitForm.reason_for_visit}
                      onChange={(e) =>
                        setEditVisitForm({
                          ...editVisitForm,
                          reason_for_visit: e.target.value,
                        })
                      }
                    />
                  </Field>

                </div>

                <Field label="Symptoms / Patient Complaint">
                  <Textarea
                    rows={3}
                    value={editVisitForm.symptoms}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        symptoms: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Clinical Notes">
                  <Textarea
                    rows={4}
                    value={editVisitForm.clinical_notes}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        clinical_notes: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Diagnosis">
                  <Textarea
                    rows={2}
                    value={editVisitForm.diagnosis}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        diagnosis: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Treatment / Medication">
                  <Textarea
                    rows={3}
                    value={editVisitForm.treatment}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        treatment: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Follow-up Instructions">
                  <Textarea
                    rows={3}
                    value={editVisitForm.follow_up}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        follow_up: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Additional Notes">
                  <Textarea
                    rows={2}
                    value={editVisitForm.notes}
                    onChange={(e) =>
                      setEditVisitForm({
                        ...editVisitForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </Field>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setEditingVisit(false)}
                  >
                    Cancel
                  </Button>

                  <Button
  onClick={async () => {
    if (!selectedVisit) return;

    const { data, error } = await supabase
      .from("patient_visits")
      .update({
        visit_date: editVisitForm.visit_date,
        visit_time: editVisitForm.visit_time || null,
        doctor_id: editVisitForm.doctor_id || null,
        reason_for_visit: editVisitForm.reason_for_visit || null,
        symptoms: editVisitForm.symptoms || null,
        clinical_notes: editVisitForm.clinical_notes || null,
        diagnosis: editVisitForm.diagnosis || null,
        treatment: editVisitForm.treatment || null,
        follow_up: editVisitForm.follow_up || null,
        notes: editVisitForm.notes || null,
      })
      .eq("id", selectedVisit.id)
      .select(`
        *,
        doctor:employees(id, first_name, surname)
      `)
      .single();

    if (error) {
      console.error("Error updating visit:", error);
      setLoadError(error.message);
      return;
    }

    if (data) {
      setSelectedVisit(data);

      setVisits((current) =>
        current.map((visit) =>
          visit.id === data.id ? data : visit
        )
      );
    }

    setEditingVisit(false);
  }}
>
  Save Changes
</Button>
                </div>

              </div>
            )}
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
