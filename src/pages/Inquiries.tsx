import { useEffect, useState, useRef } from "react";
import { Inbox, Eye, Save, Send, Mail, Phone, User, MessageSquare, Clock, CheckCircle2, XCircle, Plus, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge, Modal, Field, Select, Textarea, Input, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, formatDate, formatDateTime } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Inquiry, InquiryReply, InquiryStatus, EmailStatus } from "@/types";

const STATUS_OPTIONS: InquiryStatus[] = ["New", "Contacted", "In Progress", "Completed", "Canceled"];

const statusColors: Record<InquiryStatus, "amber" | "blue" | "teal" | "green" | "red"> = {
  New: "amber",
  Contacted: "blue",
  "In Progress": "teal",
  Completed: "green",
  Canceled: "red",
};

const emailStatusColors: Record<EmailStatus, "amber" | "green" | "red" | "slate"> = {
  pending: "amber",
  sent: "green",
  failed: "red",
  not_applicable: "slate",
};

export function Inquiries() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [replies, setReplies] = useState<InquiryReply[]>([]);
  const [viewOpen, setViewOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);
  const [replyMode, setReplyMode] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyResult, setReplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ patient_name: "", patient_email: "", phone: "", subject: "", message: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  async function load() {
    setLoading(true);
    let query = supabase.from("inquiries").select("*").order("created_at", { ascending: false });
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data } = await query;
    setInquiries(data as Inquiry[] ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  // Realtime: receive new inquiry inserts instantly without page refresh
  useEffect(() => {
    const channel = supabase
      .channel("inquiries-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiries" },
        () => { load(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inquiries" },
        () => { load(); }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  async function openView(inq: Inquiry) {
    setSelected(inq);
    setViewOpen(true);
    setReplyMode(false);
    setReplyText("");
    setReplyResult(null);
    setStatusSaved(false);
    // Load replies
    const { data } = await supabase
      .from("inquiry_replies")
      .select("*")
      .eq("inquiry_id", inq.id)
      .order("created_at", { ascending: true });
    setReplies(data as InquiryReply[] ?? []);
  }

  async function saveStatus() {
    if (!selected) return;
    setStatusSaving(true);
    const { error } = await supabase
      .from("inquiries")
      .update({ status: selected.status, updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (!error) {
      await logAudit("inquiry_status_changed", "inquiry", selected.id, { status: selected.status });
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 3000);
      load();
    }
    setStatusSaving(false);
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setReplySending(true);
    setReplyResult(null);
    try {
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-inquiry-reply`;
      const res = await fetch(funcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          inquiryId: selected.id,
          replyMessage: replyText,
          patientEmail: selected.patient_email,
          patientName: selected.patient_name,
          subject: selected.subject,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reply failed");
      }
      setReplyResult({
        success: data.emailSent !== false,
        message: data.emailSent ? "Reply sent successfully — email delivered to patient." : "Reply saved, but email delivery failed. The reply is recorded in the system.",
      });
      if (data.emailSent === false && data.emailError) {
        setReplyResult({
          success: false,
          message: `Reply saved, but email delivery failed: ${data.emailError}`,
        });
      }
      setReplyText("");
      setReplyMode(false);
      // Reload replies and inquiry
      const { data: updatedReplies } = await supabase
        .from("inquiry_replies")
        .select("*")
        .eq("inquiry_id", selected.id)
        .order("created_at", { ascending: true });
      setReplies(updatedReplies as InquiryReply[] ?? []);
      const { data: updatedInq } = await supabase.from("inquiries").select("*").eq("id", selected.id).maybeSingle();
      if (updatedInq) setSelected(updatedInq as Inquiry);
      load();
    } catch (err) {
      setReplyResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to send reply",
      });
    } finally {
      setReplySending(false);
    }
  }

  async function addInquiry(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!addForm.patient_name.trim() || !addForm.patient_email.trim() || !addForm.subject.trim() || !addForm.message.trim()) {
      setAddError("Patient name, email, subject, and message are required");
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.from("inquiries").insert({
      patient_name: addForm.patient_name,
      patient_email: addForm.patient_email,
      phone: addForm.phone || null,
      subject: addForm.subject,
      message: addForm.message,
      status: "New",
      email_status: "pending",
      source: "admin",
    });
    if (error) {
      setAddError(error.message);
      setAddSaving(false);
      return;
    }
    await logAudit("inquiry_created", "inquiry", undefined, { subject: addForm.subject });
    setAddSaving(false);
    setAddOpen(false);
    setAddForm({ patient_name: "", patient_email: "", phone: "", subject: "", message: "" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle={`${inquiries.length} inquiry${inquiries.length !== 1 ? "s" : ""} in the system`}
        action={canEdit && <Button onClick={() => { setAddError(null); setAddOpen(true); }}><Plus size={16} /> Add Inquiry</Button>}
      />

      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {!statusFilter && (
          <Badge color="amber">{inquiries.filter((i) => i.status === "New").length} New</Badge>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading inquiries...</div>
      ) : inquiries.length === 0 ? (
        <Card><EmptyState icon={<Inbox size={48} />} title="No inquiries found" description="Patient inquiries will appear here. You can also manually add one." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Patient Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Email Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inquiries.map((inq) => (
                  <tr key={inq.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{inq.patient_name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{inq.patient_email}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{inq.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">{inq.subject}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate text-xs">{inq.message}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(inq.created_at)}</td>
                    <td className="px-4 py-3"><Badge color={statusColors[inq.status]}>{inq.status}</Badge></td>
                    <td className="px-4 py-3"><Badge color={emailStatusColors[inq.email_status]}>{inq.email_status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inq.source === "public" && <Globe size={12} className="text-blue-500" /> }
                        <button onClick={() => openView(inq)} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700">
                          <Eye size={14} /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View Inquiry Modal */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Inquiry Details" size="lg">
        {selected && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <User size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{selected.subject}</h3>
                <p className="text-sm text-slate-500">from {selected.patient_name}</p>
                <div className="flex gap-2 mt-2">
                  <Badge color={statusColors[selected.status]}>{selected.status}</Badge>
                  <Badge color={emailStatusColors[selected.email_status]}>Email: {selected.email_status}</Badge>
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid gap-3 sm:grid-cols-2 rounded-lg bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm">
                <Mail size={15} className="text-slate-400" />
                <span className="text-slate-600">{selected.patient_email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone size={15} className="text-slate-400" />
                <span className="text-slate-600">{selected.phone ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={15} className="text-slate-400" />
                <span className="text-slate-600">{formatDateTime(selected.created_at)}</span>
              </div>
            </div>

            {/* Message */}
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={15} className="text-slate-400" />
                <h4 className="text-xs font-semibold uppercase text-slate-400">Inquiry Message</h4>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.message}</p>
            </div>

            {/* Previous replies */}
            {replies.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-400">Reply History ({replies.length})</h4>
                {replies.map((r) => (
                  <div key={r.id} className={`rounded-lg border p-3 ${r.email_status === "sent" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">{formatDateTime(r.created_at)}</span>
                      <Badge color={r.email_status === "sent" ? "green" : "red"}>{r.email_status}</Badge>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.reply_message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Status change */}
            {canEdit && (
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-3">Change Status</h4>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Field label="Inquiry Status">
                      <Select
                        value={selected.status}
                        onChange={(e) => {
                          setSelected({ ...selected, status: e.target.value as InquiryStatus });
                          setStatusSaved(false);
                        }}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Button onClick={saveStatus} loading={statusSaving}>
                    <Save size={16} /> Save Status
                  </Button>
                </div>
                {statusSaved && <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> Status saved successfully</p>}
              </div>
            )}

            {/* Reply result message */}
            {replyResult && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${replyResult.success ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                <div className="flex items-start gap-2">
                  {replyResult.success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                  <span>{replyResult.message}</span>
                </div>
              </div>
            )}

            {/* Reply box */}
            {canEdit && !replyMode && (
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button onClick={() => setReplyMode(true)}>
                  <Mail size={16} /> Reply to Patient
                </Button>
              </div>
            )}

            {canEdit && replyMode && (
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Reply to {selected.patient_name}</h4>
                  <button onClick={() => { setReplyMode(false); setReplyText(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
                <p className="text-xs text-slate-500">The reply will be emailed to {selected.patient_email}</p>
                <Field label="Reply Message">
                  <Textarea
                    rows={5}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply to the patient..."
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setReplyMode(false); setReplyText(""); }}>Cancel</Button>
                  <Button onClick={sendReply} loading={replySending} disabled={!replyText.trim()}>
                    <Send size={16} /> Send Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Inquiry Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Inquiry" size="lg">
        <form onSubmit={addInquiry} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Patient Name" required>
              <Input value={addForm.patient_name} onChange={(e) => setAddForm({ ...addForm, patient_name: e.target.value })} placeholder="John Smith" />
            </Field>
            <Field label="Patient Email" required>
              <Input type="email" value={addForm.patient_email} onChange={(e) => setAddForm({ ...addForm, patient_email: e.target.value })} placeholder="patient@email.com" />
            </Field>
          </div>
          <Field label="Phone">
            <Input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="082 123 4567" />
          </Field>
          <Field label="Subject" required>
            <Input value={addForm.subject} onChange={(e) => setAddForm({ ...addForm, subject: e.target.value })} placeholder="Appointment inquiry" />
          </Field>
          <Field label="Message" required>
            <Textarea rows={4} value={addForm.message} onChange={(e) => setAddForm({ ...addForm, message: e.target.value })} placeholder="Patient's inquiry message..." />
          </Field>
          <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            New inquiries are automatically assigned the status "New".
          </div>
          {addError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{addError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={addSaving}>Add Inquiry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
