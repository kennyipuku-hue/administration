import { useEffect, useState, type ReactNode } from "react";
import { Users, Building2, Stethoscope, CalendarDays, TrendingUp, Activity, MapPin, Phone, Mail, Clock, Eye, Inbox, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Badge, Modal, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage, formatDate, fullName } from "@/lib/utils";
import type { Branch, Employee, Appointment, Inquiry, InquiryStatus } from "@/types";

interface Stats {
  patients: number;
  branches: number;
  doctors: number;
  appointmentsToday: number;
}

type ModalType = "branches" | "doctors" | "appointments" | null;

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ patients: 0, branches: 0, doctors: 0, appointmentsToday: 0 });
  const [recentPatients, setRecentPatients] = useState<{ id: string; first_name: string; surname: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<ModalType>(null);

  // Modal data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Employee[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Inquiries
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(true);

  async function loadStats() {
    const [p, b, d, a, rp] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase.from("branches").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("position", "Doctor").eq("status", "active"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("appointment_date", new Date().toISOString().slice(0, 10)),
      supabase.from("patients").select("id, first_name, surname, created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    setStats({
      patients: p.count ?? 0,
      branches: b.count ?? 0,
      doctors: d.count ?? 0,
      appointmentsToday: a.count ?? 0,
    });
    setRecentPatients(rp.data ?? []);
    setLoading(false);
  }

  async function loadInquiries() {
    setInquiriesLoading(true);
    const { data } = await supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setInquiries(data as Inquiry[] ?? []);
    setInquiriesLoading(false);
  }

  useEffect(() => {
    loadStats();
    loadInquiries();
  }, []);

  async function openModal(type: ModalType) {
    if (!type) return;
    setModalType(type);
    setModalLoading(true);

    if (type === "branches") {
      const { data } = await supabase.from("branches").select("*").eq("status", "active").order("branch_name");
      setBranches(data as Branch[] ?? []);
    } else if (type === "doctors") {
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("position", "Doctor")
        .eq("status", "active")
        .order("surname");
      setDoctors(data as Employee[] ?? []);
    } else if (type === "appointments") {
      const { data } = await supabase
        .from("appointments")
        .select("*, patient:patients(id, first_name, surname, patient_number), doctor:employees!appointments_doctor_id_fkey(id, first_name, surname), branch:branches(*)")
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(20);
      setAppointments(data as unknown as Appointment[] ?? []);
    }
    setModalLoading(false);
  }

  const statCards = [
    { label: "Total Patients", value: stats.patients, icon: <Users size={20} />, color: "text-teal-600 bg-teal-50", onClick: () => onNavigate("patients") },
    { label: "Active Branches", value: stats.branches, icon: <Building2 size={20} />, color: "text-blue-600 bg-blue-50", onClick: () => openModal("branches") },
    { label: "Active Doctors", value: stats.doctors, icon: <Stethoscope size={20} />, color: "text-emerald-600 bg-emerald-50", onClick: () => openModal("doctors") },
    { label: "Appointments Today", value: stats.appointmentsToday, icon: <CalendarDays size={20} />, color: "text-amber-600 bg-amber-50", onClick: () => openModal("appointments") },
  ];

  const inquiryStatusColors: Record<InquiryStatus, "amber" | "blue" | "teal" | "green" | "red"> = {
    New: "amber",
    Contacted: "blue",
    "In Progress": "teal",
    Completed: "green",
    Canceled: "red",
  };

  const emailStatusColors: Record<string, "slate" | "green" | "red" | "amber"> = {
    pending: "amber",
    sent: "green",
    failed: "red",
    not_applicable: "slate",
  };

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.first_name ?? ""}`}
        subtitle="Practice overview and recent activity"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5 cursor-pointer hover:shadow-md transition-shadow" >
            <button onClick={card.onClick} className="w-full text-left">
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                  {card.icon}
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? "—" : card.value}</p>
              <p className="text-sm text-slate-500">{card.label}</p>
            </button>
          </Card>
        ))}
      </div>

      {/* Inquiries section */}
      <div className="mt-6">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Inbox size={18} className="text-teal-600" />
              <h3 className="text-sm font-semibold text-slate-900">Recent Inquiries</h3>
              {!inquiriesLoading && inquiries.length > 0 && (
                <Badge color="amber">{inquiries.filter((i) => i.status === "New").length} new</Badge>
              )}
            </div>
            <button onClick={() => onNavigate("inquiries")} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
              View All <ArrowRight size={14} />
            </button>
          </div>

          {inquiriesLoading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading inquiries...</div>
          ) : inquiries.length === 0 ? (
            <EmptyState icon={<Inbox size={40} />} title="No inquiries yet" description="Patient inquiries will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Patient Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inquiries.slice(0, 5).map((inq) => (
                    <tr key={inq.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{inq.patient_name}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{inq.patient_email}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{inq.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{inq.subject}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(inq.created_at)}</td>
                      <td className="px-4 py-3"><Badge color={inquiryStatusColors[inq.status]}>{inq.status}</Badge></td>
                      <td className="px-4 py-3"><Badge color={emailStatusColors[inq.email_status]}>{inq.email_status}</Badge></td>
                      <td className="px-4 py-3">
                        <button onClick={() => onNavigate("inquiries")} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700">
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Recent patients + practice info */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Recently Registered Patients</h3>
          </div>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No patients registered yet.</p>
          ) : (
            <div className="space-y-2">
              {recentPatients.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {p.first_name[0]}{p.surname[0]}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{p.first_name} {p.surname}</span>
                  </div>
                  <Badge color="slate">{new Date(p.created_at).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Practice Information</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Practice</span>
              <span className="font-medium text-slate-700">MEDICAL GP — PRACTICE AND PARTNERS INC</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Primary Doctor</span>
              <span className="font-medium text-slate-700">Dr PJCA Mbizi (GP)</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">HPCSA Number</span>
              <span className="font-medium text-slate-700">MP0854964</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Practice Number</span>
              <span className="font-medium text-slate-700">0983616</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Hours (Mon–Fri)</span>
              <span className="font-medium text-slate-700">08:00 – 17:00</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Branches Modal */}
      <Modal open={modalType === "branches"} onClose={() => setModalType(null)} title="Active Branches" size="lg">
        {modalLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading branches...</div>
        ) : branches.length === 0 ? (
          <EmptyState title="No active branches" />
        ) : (
          <div className="space-y-3">
            {branches.map((b) => (
              <div key={b.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{b.branch_name}</h4>
                      <p className="text-xs text-slate-400">Code: {b.branch_code}</p>
                    </div>
                  </div>
                  <Badge color="green">Active</Badge>
                </div>
                <div className="space-y-1.5 text-sm text-slate-600">
                  {b.address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-slate-400 shrink-0" /> <span>{b.address}{b.city ? `, ${b.city}` : ""}{b.province ? `, ${b.province}` : ""}</span></div>}
                  {b.telephone && <div className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {b.telephone}</div>}
                  {b.email && <div className="flex items-center gap-2 text-xs"><Mail size={14} className="text-slate-400" /> {b.email}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Doctors Modal */}
      <Modal open={modalType === "doctors"} onClose={() => setModalType(null)} title="Active Doctors" size="lg">
        {modalLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading doctors...</div>
        ) : doctors.length === 0 ? (
          <EmptyState title="No active doctors" />
        ) : (
          <div className="space-y-3">
            {doctors.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
                      {d.first_name[0]}{d.surname[0]}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Dr {d.first_name} {d.surname}</h4>
                      <p className="text-xs text-slate-400">{d.department ?? "General Practice"}</p>
                    </div>
                  </div>
                  <Badge color="green">Active</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2">
                  {d.hpcsa_number && <div><span className="text-slate-400">HPCSA:</span> {d.hpcsa_number}</div>}
                  {d.practice_number && <div><span className="text-slate-400">Practice No:</span> {d.practice_number}</div>}
                  {d.phone && <div><span className="text-slate-400">Phone:</span> {d.phone}</div>}
                  {d.email && <div className="truncate"><span className="text-slate-400">Email:</span> {d.email}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Appointments Modal */}
      <Modal open={modalType === "appointments"} onClose={() => setModalType(null)} title="Appointments" size="xl">
        {modalLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <EmptyState icon={<CalendarDays size={40} />} title="No appointments" description="No appointments have been scheduled yet." />
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {appointments.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <CalendarDays size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{a.patient ? fullName(a.patient.first_name, a.patient.surname) : "Unknown"}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(a.appointment_date)} · {a.appointment_time.slice(0, 5)}</span>
                        {a.doctor && <span>Dr {a.doctor.first_name} {a.doctor.surname}</span>}
                        {a.branch && <Badge color="blue">{a.branch.branch_code}</Badge>}
                      </div>
                      {a.reason && <p className="mt-1 text-xs text-slate-400">{a.reason}</p>}
                    </div>
                  </div>
                  <Badge color={a.status === "scheduled" ? "amber" : a.status === "completed" ? "green" : a.status === "cancelled" ? "red" : "slate"}>{a.status.replace("_", " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
