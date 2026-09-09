import { useEffect, useState } from "react";
import { CalendarDays, Plus, Clock, User, Stethoscope } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Input, Select, Textarea, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, formatDate, fullName } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Appointment, Patient, Employee, Branch } from "@/types";

export function Appointments() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ patient_id: "", doctor_id: "", branch_id: "", appointment_date: "", appointment_time: "09:00", duration_minutes: 30, reason: "", notes: "", status: "scheduled" });

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("appointments")
      .select("*, patient:patients(id, first_name, surname, patient_number), doctor:employees!appointments_doctor_id_fkey(id, first_name, surname), branch:branches(*)")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(50);
    if (error) {
      setLoadError(error.message);
    } else {
      setAppointments(data as unknown as Appointment[] ?? []);
    }
    setLoading(false);
  }

  async function loadFormOptions() {
    const [{ data: pts }, { data: docs }, { data: brs }] = await Promise.all([
      supabase.from("patients").select("id, first_name, surname, patient_number, branch_id").order("surname").limit(500),
      supabase.from("employees").select("*").eq("position", "Doctor").eq("status", "active").order("surname"),
      supabase.from("branches").select("*").eq("status", "active").order("branch_name"),
    ]);
    setPatients(pts as unknown as Patient[] ?? []);
    setDoctors(docs as Employee[] ?? []);
    setBranches(brs as Branch[] ?? []);
  }

  useEffect(() => {
  load();

  const channel = supabase
    .channel("appointments-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "appointments",
      },
      () => {
        load();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  function openNew() {
    loadFormOptions();
    setForm({ patient_id: "", doctor_id: "", branch_id: "", appointment_date: new Date().toISOString().slice(0, 10), appointment_time: "09:00", duration_minutes: 30, reason: "", notes: "", status: "scheduled" });
    setError(null);
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.patient_id || !form.branch_id || !form.appointment_date || !form.appointment_time) {
      setError("Patient, branch, date, and time are required");
      return;
    }
    setSaving(true);
    const { data, error: err } = await supabase.from("appointments").insert({
      patient_id: form.patient_id, doctor_id: form.doctor_id || null, branch_id: form.branch_id,
      appointment_date: form.appointment_date, appointment_time: form.appointment_time,
      duration_minutes: form.duration_minutes, reason: form.reason || null, notes: form.notes || null, status: form.status,
    }).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    await logAudit("appointment_created", "appointment", data.id, { date: form.appointment_date, time: form.appointment_time });
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function updateStatus(appt: Appointment, status: Appointment["status"]) {
    await supabase.from("appointments").update({ status }).eq("id", appt.id);
    await logAudit("appointment_status_changed", "appointment", appt.id, { status });
    load();
  }

  const statusColors: Record<string, "green" | "red" | "amber" | "slate" | "teal"> = {
  scheduled: "amber",
  queued: "teal",
  completed: "green",
  cancelled: "red",
  no_show: "slate",
};

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Schedule and manage patient appointments" action={canEdit && <Button onClick={openNew}><Plus size={16} /> New Appointment</Button>} />

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading appointments...</div>
      ) : loadError ? (
        <Card><div className="p-6 text-center"><p className="text-sm text-red-600">{loadError}</p><Button className="mt-3" onClick={load}>Retry</Button></div></Card>
      ) : appointments.length === 0 ? (
        <Card><EmptyState icon={<CalendarDays size={48} />} title="No appointments" description="Schedule your first patient appointment." /></Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <Card key={a.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{a.patient ? fullName(a.patient.first_name, a.patient.surname) : "Unknown"}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Clock size={12} /> {formatDate(a.appointment_date)} · {a.appointment_time.slice(0, 5)}</span>
                      {a.doctor && <span className="flex items-center gap-1"><Stethoscope size={12} /> Dr {a.doctor.first_name} {a.doctor.surname}</span>}
                      {a.branch && <Badge color="blue">{a.branch.branch_code}</Badge>}
                    </div>
                    {a.reason && <p className="mt-1 text-sm text-slate-600">{a.reason}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={statusColors[a.status]}>{a.status.replace("_", " ")}</Badge>
                  {canEdit && a.status === "scheduled" && (
                    <div className="flex gap-1">
                      <button onClick={() => updateStatus(a, "completed")} className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50">Complete</button>
                      <button onClick={() => updateStatus(a, "cancelled")} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Appointment" size="lg">
        <form onSubmit={save} className="space-y-4">
          <Field label="Patient" required>
            <Select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">— Select Patient —</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{fullName(p.first_name, p.surname)} {p.patient_number ? `(${p.patient_number})` : ""}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch" required>
              <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                <option value="">— Select —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
              </Select>
            </Field>
            <Field label="Doctor">
              <Select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
                <option value="">— Select —</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.first_name} {d.surname}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Date" required><Input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} /></Field>
            <Field label="Time" required><Input type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} /></Field>
            <Field label="Duration (min)"><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 30 })} /></Field>
          </div>
          <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. General consultation" /></Field>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create Appointment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
