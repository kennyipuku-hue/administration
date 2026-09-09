import { useEffect, useState } from "react";
import { Users, Plus, Clock, Stethoscope, CheckCircle2, XCircle, UserCheck, Timer, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Select, Input, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, fullName } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { QueueEntry, Patient, Employee, Branch } from "@/types";

export function Queue() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [form, setForm] = useState({ patient_id: "", branch_id: "", doctor_id: "", reason: "" });

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("patient_queue")
      .select("*, patient:patients(id, first_name, surname, patient_number, phone), doctor:employees!patient_queue_doctor_id_fkey(id, first_name, surname), branch:branches(*)")
      .in("status", ["waiting", "with_doctor"])
      .order("checked_in_at", { ascending: true });
    if (!err) setEntries(data as unknown as QueueEntry[] ?? []);
    setLoading(false);
  }

  async function loadFormOptions() {
    const [{ data: pts }, { data: docs }, { data: brs }] = await Promise.all([
      supabase.from("patients").select("id, first_name, surname, patient_number, phone, branch_id").order("surname").limit(500),
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
    .channel("patient-queue-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "patient_queue",
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

  function openAdd() {
    loadFormOptions();
    setForm({ patient_id: "", branch_id: "", doctor_id: "", reason: "" });
    setError(null);
    setAddOpen(true);
  }

  async function addToQueue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.patient_id || !form.branch_id) {
      setError("Patient and branch are required");
      return;
    }
    setSaving(true);
    // Get next queue number for this branch today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: existing } = await supabase
      .from("patient_queue")
      .select("queue_number")
      .eq("branch_id", form.branch_id)
      .gte("checked_in_at", todayStart.toISOString())
      .order("queue_number", { ascending: false })
      .limit(1);
    const nextNum = (existing && existing.length > 0 ? existing[0].queue_number : 0) + 1;

    const { data, error: err } = await supabase.from("patient_queue").insert({
      patient_id: form.patient_id,
      branch_id: form.branch_id,
      doctor_id: form.doctor_id || null,
      queue_number: nextNum,
      reason: form.reason || null,
      status: "waiting",
    }).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    await logAudit("queue_added", "patient_queue", data.id, { queue_number: nextNum });
    setSaving(false);
    setAddOpen(false);
    load();
  }

  async function sendToDoctor(entry: QueueEntry) {
    const { error: err } = await supabase.from("patient_queue").update({
      status: "with_doctor",
      called_at: new Date().toISOString(),
    }).eq("id", entry.id);
    if (err) return;
    await logAudit("queue_sent_to_doctor", "patient_queue", entry.id, { doctor_id: entry.doctor_id });
    load();
  }

  async function completeEntry(entry: QueueEntry) {
    const { error: err } = await supabase.from("patient_queue").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", entry.id);
    if (err) return;
    await logAudit("queue_completed", "patient_queue", entry.id, {});
    load();
  }

  async function cancelEntry(entry: QueueEntry) {
    const { error: err } = await supabase.from("patient_queue").update({
      status: "cancelled",
    }).eq("id", entry.id);
    if (err) return;
    await logAudit("queue_cancelled", "patient_queue", entry.id, {});
    load();
  }

  const filtered = branchFilter ? entries.filter((e) => e.branch_id === branchFilter) : entries;
  const waiting = filtered.filter((e) => e.status === "waiting");
  const withDoctor = filtered.filter((e) => e.status === "with_doctor");

  const statusConfig: Record<string, { color: "amber" | "teal" | "green" | "red"; label: string; icon: typeof Clock }> = {
    waiting: { color: "amber", label: "Waiting", icon: Clock },
    with_doctor: { color: "teal", label: "With Doctor", icon: Stethoscope },
    completed: { color: "green", label: "Completed", icon: CheckCircle2 },
    cancelled: { color: "red", label: "Cancelled", icon: XCircle },
  };

  function timeAgo(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  return (
    <div>
      <PageHeader
        title="Patient Queue"
        subtitle="Reception queue — patients waiting to see a doctor"
        action={canEdit && <Button onClick={openAdd}><Plus size={16} /> Add to Queue</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-48">
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
        </Select>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5">
            <Clock size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-700">{waiting.length} waiting</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5">
            <Stethoscope size={16} className="text-teal-600" />
            <span className="text-sm font-medium text-teal-700">{withDoctor.length} with doctor</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading queue...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={48} />}
            title="Queue is empty"
            description="When patients arrive at reception, add them to the queue."
            action={canEdit && <Button onClick={openAdd}><Plus size={16} /> Add to Queue</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Waiting section */}
          {waiting.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Clock size={18} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">Waiting ({waiting.length})</h3>
              </div>
              <div className="space-y-2">
                {waiting.map((entry) => {
                  const sc = statusConfig[entry.status];
                  return (
                    <Card key={entry.id} className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-amber-400">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700 font-bold text-sm">
                            #{entry.queue_number}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {entry.patient ? fullName(entry.patient.first_name, entry.patient.surname) : "Unknown"}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><Timer size={12} /> {timeAgo(entry.checked_in_at)}</span>
                              {entry.patient?.patient_number && <span>· {entry.patient.patient_number}</span>}
                              {entry.branch && <Badge color="blue">{entry.branch.branch_code}</Badge>}
                              {entry.reason && <span className="text-slate-400">· {entry.reason}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={sc.color}>{sc.label}</Badge>
                          {canEdit && (
                            <Button size="sm" onClick={() => sendToDoctor(entry)}>
                              <UserCheck size={14} /> Send to Doctor
                            </Button>
                          )}
                          {canEdit && (
                            <button onClick={() => cancelEntry(entry)} className="rounded p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* With Doctor section */}
          {withDoctor.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Stethoscope size={18} className="text-teal-500" />
                <h3 className="text-sm font-semibold text-slate-900">With Doctor ({withDoctor.length})</h3>
              </div>
              <div className="space-y-2">
                {withDoctor.map((entry) => {
                  const sc = statusConfig[entry.status];
                  return (
                    <Card key={entry.id} className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-teal-500">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold text-sm">
                            #{entry.queue_number}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {entry.patient ? fullName(entry.patient.first_name, entry.patient.surname) : "Unknown"}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><Stethoscope size={12} /> {entry.doctor ? `Dr ${entry.doctor.first_name} ${entry.doctor.surname}` : "Any doctor"}</span>
                              <span className="flex items-center gap-1"><ArrowRight size={12} /> {timeAgo(entry.called_at ?? entry.checked_in_at)}</span>
                              {entry.branch && <Badge color="blue">{entry.branch.branch_code}</Badge>}
                              {entry.reason && <span className="text-slate-400">· {entry.reason}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={sc.color}>{sc.label}</Badge>
                          {canEdit && (
                            <Button size="sm" variant="primary" onClick={() => completeEntry(entry)}>
                              <CheckCircle2 size={14} /> Completed
                            </Button>
                          )}
                          {canEdit && (
                            <button onClick={() => cancelEntry(entry)} className="rounded p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Patient to Queue">
        <form onSubmit={addToQueue} className="space-y-4">
          <Field label="Patient" required>
            <Select value={form.patient_id} onChange={(e) => {
              const p = patients.find((x) => x.id === e.target.value);
              setForm({ ...form, patient_id: e.target.value, branch_id: p?.branch_id ?? form.branch_id });
            }}>
              <option value="">— Select Patient —</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{fullName(p.first_name, p.surname)} {p.patient_number ? `(${p.patient_number})` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Branch" required>
            <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">— Select Branch —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
            </Select>
          </Field>
          <Field label="Assign Doctor (optional)" hint="Pre-assign a doctor, or leave blank for any available">
            <Select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
              <option value="">— Any Doctor —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.first_name} {d.surname}</option>)}
            </Select>
          </Field>
          <Field label="Reason for Visit">
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Follow-up, consultation, flu symptoms" />
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}><Plus size={16} /> Add to Queue</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
