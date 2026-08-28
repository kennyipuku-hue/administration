import { useEffect, useState } from "react";
import { HeartPulse, Save, UserPlus, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, generatePatientNumber } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Branch, Employee } from "@/types";

export function RegisterPatient({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Employee[]>([]);
  const [employeeBranches, setEmployeeBranches] = useState<{ employee_id: string; branch_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [savedNumber, setSavedNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "", surname: "", date_of_birth: "", gender: "", id_number: "", phone: "", email: "",
    address: "", city: "", province: "", postal_code: "", blood_type: "", allergies: "", chronic_conditions: "",
    medications: "", notes: "", branch_id: "", assigned_doctor_id: "",
  });
  const [emergency, setEmergency] = useState({ contact_name: "", relationship: "", phone: "", email: "" });

  useEffect(() => {
    (async () => {
      const [{ data: brs }, { data: docs }, { data: ebs }] = await Promise.all([
        supabase.from("branches").select("*").eq("status", "active").order("branch_name"),
        supabase.from("employees").select("*").eq("position", "Doctor").eq("status", "active").order("surname"),
        supabase.from("employee_branches").select("employee_id, branch_id").eq("status", "active"),
      ]);
      setBranches(brs ?? []);
      setDoctors(docs ?? []);
      setEmployeeBranches(ebs ?? []);
      setLoading(false);
    })();
  }, []);

  // Available doctors for selected branch
  const availableDoctors = doctors.filter((d) => {
    if (!form.branch_id) return true;
    const ebForBranch = employeeBranches.some((eb) => eb.employee_id === d.id && eb.branch_id === form.branch_id);
    return ebForBranch || d.branch_id === form.branch_id || employeeBranches.filter((eb) => eb.employee_id === d.id).length === 0;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canEdit) { setError("You do not have permission to register patients"); return; }
    if (!form.first_name.trim() || !form.surname.trim()) { setError("Patient first name and surname are required"); return; }
    if (!form.branch_id) { setError("Please select a branch"); return; }

    setSaving(true);
    const patientNumber = generatePatientNumber();
    const payload = {
      patient_number: patientNumber,
      first_name: form.first_name, surname: form.surname,
      date_of_birth: form.date_of_birth || null, gender: form.gender || "",
      id_number: form.id_number || null, phone: form.phone || null, email: form.email || null,
      address: form.address || null, city: form.city || null, province: form.province || null, postal_code: form.postal_code || null,
      blood_type: form.blood_type || null, allergies: form.allergies || null, chronic_conditions: form.chronic_conditions || null,
      medications: form.medications || null, notes: form.notes || null,
      branch_id: form.branch_id, assigned_doctor_id: form.assigned_doctor_id || null,
    };
    const { data, error: err } = await supabase.from("patients").insert(payload).select().single();
    if (err) { setError(err.message); setSaving(false); return; }

    if (emergency.contact_name.trim()) {
      await supabase.from("patient_emergency_contacts").insert({
        patient_id: data.id, contact_name: emergency.contact_name, relationship: emergency.relationship || null,
        phone: emergency.phone || null, email: emergency.email || null,
      });
    }

    await logAudit("patient_registered", "patient", data.id, { patient_number: patientNumber, name: `${form.first_name} ${form.surname}` });
    setSavedNumber(patientNumber);
    setSuccess(true);
    setSaving(false);
  }

  function resetForm() {
    setForm({ first_name: "", surname: "", date_of_birth: "", gender: "", id_number: "", phone: "", email: "", address: "", city: "", province: "", postal_code: "", blood_type: "", allergies: "", chronic_conditions: "", medications: "", notes: "", branch_id: "", assigned_doctor_id: "" });
    setEmergency({ contact_name: "", relationship: "", phone: "", email: "" });
    setSuccess(false);
    setError(null);
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Patient Registered</h2>
          <p className="mt-1 text-sm text-slate-500">The patient has been saved to the system.</p>
          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-400">Patient Number</p>
            <p className="text-lg font-mono font-semibold text-teal-700">{savedNumber}</p>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={onDone}>Go to Patient List</Button>
            <Button onClick={resetForm}><UserPlus size={16} /> Register Another</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) return <div className="text-center py-12 text-slate-400">Loading form...</div>;

  return (
    <div>
      <PageHeader title="Register Patient" subtitle="Add a new patient to the practice" />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Assignment section */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Branch & Doctor Assignment</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch" required>
              <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value, assigned_doctor_id: "" })}>
                <option value="">— Select Branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
              </Select>
            </Field>
            <Field label="Assigned Doctor" hint={form.branch_id ? "Doctors available at this branch are shown" : "Select a branch first"}>
              <Select value={form.assigned_doctor_id} onChange={(e) => setForm({ ...form, assigned_doctor_id: e.target.value })} disabled={!form.branch_id}>
                <option value="">— Select Doctor —</option>
                {availableDoctors.map((d) => <option key={d.id} value={d.id}>Dr {d.first_name} {d.surname}</option>)}
              </Select>
            </Field>
          </div>
        </Card>

        {/* Personal info */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Personal Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First Name" required><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Surname" required><Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></Field>
            <Field label="Date of Birth"><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">— Select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field label="ID Number"><Input value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} /></Field>
            <Field label="Blood Type">
              <Select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>
                <option value="">— Select —</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </Select>
            </Field>
          </div>
        </Card>

        {/* Contact */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Contact Details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="082 123 4567" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Province"><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
            <Field label="Postal Code"><Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></Field>
          </div>
        </Card>

        {/* Medical */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Medical Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Allergies"><Textarea rows={2} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. Penicillin, peanuts" /></Field>
            <Field label="Chronic Conditions"><Textarea rows={2} value={form.chronic_conditions} onChange={(e) => setForm({ ...form, chronic_conditions: e.target.value })} placeholder="e.g. Diabetes, hypertension" /></Field>
            <Field label="Current Medications"><Textarea rows={2} value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </Card>

        {/* Emergency contact */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Emergency Contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact Name"><Input value={emergency.contact_name} onChange={(e) => setEmergency({ ...emergency, contact_name: e.target.value })} /></Field>
            <Field label="Relationship"><Input value={emergency.relationship} onChange={(e) => setEmergency({ ...emergency, relationship: e.target.value })} placeholder="e.g. Spouse, parent" /></Field>
            <Field label="Phone"><Input value={emergency.phone} onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={emergency.email} onChange={(e) => setEmergency({ ...emergency, email: e.target.value })} /></Field>
          </div>
        </Card>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!canEdit}>
            <Save size={16} /> Register Patient
          </Button>
        </div>
        {!canEdit && <p className="text-xs text-slate-400 text-right">Only administrators can register patients.</p>}
      </form>
    </div>
  );
}
