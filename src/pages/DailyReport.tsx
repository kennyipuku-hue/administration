import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Users,
  Inbox,
  Stethoscope,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Printer,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { Branch } from "@/types";

type Category = "queue" | "inquiry" | "patient" | "employee" | "appointment" | "audit";

interface ReportEvent {
  id: string;
  timestamp: string;
  category: Category;
  title: string;
  detail: string;
  meta?: string;
  branchName?: string;
  status?: string;
  actor?: string;
}

const categoryConfig: Record<
  Category,
  { label: string; icon: typeof Users; color: string; badgeColor: "teal" | "amber" | "green" | "blue" | "slate" | "red" }
> = {
  queue: { label: "Queue", icon: ClipboardList, color: "text-teal-600", badgeColor: "teal" },
  inquiry: { label: "Inquiries", icon: Inbox, color: "text-amber-600", badgeColor: "amber" },
  patient: { label: "Patients", icon: Users, color: "text-emerald-600", badgeColor: "green" },
  employee: { label: "Staff", icon: Stethoscope, color: "text-blue-600", badgeColor: "blue" },
  appointment: { label: "Appointments", icon: CalendarDays, color: "text-slate-600", badgeColor: "slate" },
  audit: { label: "System", icon: ClipboardList, color: "text-red-600", badgeColor: "red" },
};

const statusBadgeColor: Record<string, "green" | "amber" | "slate" | "red" | "teal" | "blue"> = {
  completed: "green",
  waiting: "amber",
  with_doctor: "teal",
  cancelled: "red",
  scheduled: "blue",
  "no_show": "red",
  active: "green",
  inactive: "slate",
  sent: "green",
  failed: "red",
  pending: "amber",
  New: "amber",
  Contacted: "blue",
  "In Progress": "teal",
  Completed: "green",
  Canceled: "red",
};

function toLocalDate(d: Date): string {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

function prettyDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function DailyReport() {
  const today = toLocalDate(new Date());
  const [date, setDate] = useState(today);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Category | "all">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [branchesRes, queueRes, inquiryRes, patientRes, empRes, apptRes, auditRes] = await Promise.all([
        supabase.from("branches").select("id, branch_name").order("branch_name"),
        supabase.from("patient_queue")
          .select("id, status, reason, checked_in_at, called_at, completed_at, created_at, updated_at, patient:patients(first_name, surname, patient_number), doctor:employees(first_name, surname), branch:branches(branch_name)")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: true }),
        supabase.from("inquiries")
          .select("id, patient_name, patient_email, phone, subject, message, status, email_status, created_at")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: true }),
        supabase.from("patients")
          .select("id, first_name, surname, patient_number, phone, status, created_at, branch:branches(branch_name)")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: true }),
        supabase.from("employees")
          .select("id, first_name, surname, employee_number, position, status, created_at, branch:branches(branch_name)")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: true }),
        supabase.from("appointments")
          .select("id, appointment_date, appointment_time, duration_minutes, reason, status, created_at, patient:patients(first_name, surname, patient_number), doctor:employees(first_name, surname), branch:branches(branch_name)")
          .eq("appointment_date", date)
          .order("appointment_time", { ascending: true }),
        supabase.from("audit_logs")
          .select("id, action, actor_email, entity_type, details, created_at")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: true }),
      ]);

      setBranches((branchesRes.data as Branch[]) ?? []);

      const all: ReportEvent[] = [];

      (queueRes.data ?? []).forEach((q: any) => {
        const p = q.patient as any;
        const doc = q.doctor as any;
        const br = q.branch as any;
        all.push({
          id: `queue-${q.id}`,
          timestamp: q.created_at,
          category: "queue",
          title: `Queue: ${p ? `${p.first_name} ${p.surname}` : "Unknown patient"}`,
          detail: p?.patient_number ? `Patient #${p.patient_number}` : q.reason ?? "Reason not recorded",
          meta: doc ? `Seen by ${doc.first_name} ${doc.surname}` : "No doctor assigned",
          branchName: br?.branch_name,
          status: q.status,
        });
      });

      (inquiryRes.data ?? []).forEach((i: any) => {
        all.push({
          id: `inquiry-${i.id}`,
          timestamp: i.created_at,
          category: "inquiry",
          title: `Inquiry from ${i.patient_name}`,
          detail: i.subject,
          meta: `${i.patient_email}${i.phone ? ` · ${i.phone}` : ""}`,
          status: i.status,
        });
      });

      (patientRes.data ?? []).forEach((p: any) => {
        const br = p.branch as any;
        all.push({
          id: `patient-${p.id}`,
          timestamp: p.created_at,
          category: "patient",
          title: `New patient: ${p.first_name} ${p.surname}`,
          detail: p.patient_number ? `Patient #${p.patient_number}` : "No patient number assigned",
          meta: p.phone ?? "",
          branchName: br?.branch_name,
          status: p.status,
        });
      });

      (empRes.data ?? []).forEach((e: any) => {
        const br = e.branch as any;
        all.push({
          id: `employee-${e.id}`,
          timestamp: e.created_at,
          category: "employee",
          title: `New staff member: ${e.first_name} ${e.surname}`,
          detail: `${e.position}${e.employee_number ? ` · ${e.employee_number}` : ""}`,
          branchName: br?.branch_name,
          status: e.status,
        });
      });

      (apptRes.data ?? []).forEach((a: any) => {
        const p = a.patient as any;
        const doc = a.doctor as any;
        const br = a.branch as any;
        all.push({
          id: `appt-${a.id}`,
          timestamp: `${date}T${a.appointment_time}`,
          category: "appointment",
          title: `Appointment: ${p ? `${p.first_name} ${p.surname}` : "Unknown patient"}`,
          detail: a.reason ?? "No reason noted",
          meta: doc ? `With ${doc.first_name} ${doc.surname} · ${a.appointment_time.slice(0, 5)} (${a.duration_minutes} min)` : `${a.appointment_time.slice(0, 5)} · No doctor assigned`,
          branchName: br?.branch_name,
          status: a.status,
        });
      });

      (auditRes.data ?? []).forEach((l: any) => {
        const detailStr = l.details ? (typeof l.details === "object" ? Object.entries(l.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ") : String(l.details)) : "";
        all.push({
          id: `audit-${l.id}`,
          timestamp: l.created_at,
          category: "audit",
          title: l.action.replace(/_/g, " "),
          detail: detailStr || (l.entity_type ?? "No details"),
          meta: l.actor_email ?? "",
        });
      });

      all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setEvents(all);
      setLoading(false);
    })();
  }, [date]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    (Object.keys(categoryConfig) as Category[]).forEach((k) => {
      c[k] = events.filter((e) => e.category === k).length;
    });
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return events;
    return events.filter((e) => e.category === activeFilter);
  }, [events, activeFilter]);

  const isToday = date === today;

  return (
    <div>
      <PageHeader
        title="Daily Report"
        subtitle="A complete timeline of everything that happened on a given day"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </Button>
          </div>
        }
      />

      {/* Date navigation */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, -1))}>
              <ChevronLeft size={16} /> Prev
            </Button>
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-teal-600" />
              <span className="text-sm font-semibold text-slate-900">{prettyDate(date)}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday}>
              Next <ChevronRight size={16} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>
            )}
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(categoryConfig) as Category[]).map((cat) => {
          const cfg = categoryConfig[cat];
          const Icon = cfg.icon;
          const count = counts[cat] ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(activeFilter === cat ? "all" : cat)}
              className={`rounded-xl border bg-white p-3 text-left transition-all hover:shadow-md ${
                activeFilter === cat ? "border-teal-400 ring-1 ring-teal-300" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon size={18} className={cfg.color} />
                <span className="text-xl font-bold text-slate-900">{count}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      {activeFilter !== "all" && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-slate-500">Filtered by</span>
          <Badge color={categoryConfig[activeFilter].badgeColor}>{categoryConfig[activeFilter].label}</Badge>
          <button onClick={() => setActiveFilter("all")} className="text-xs font-medium text-teal-600 hover:text-teal-700">
            Clear filter
          </button>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading report...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays size={48} />}
            title="No activity on this day"
            description={isToday ? "Check back later as the day progresses." : "Nothing was recorded for this date."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {filtered.length} {filtered.length === 1 ? "event" : "events"}
              </h3>
              <span className="text-xs text-slate-500">{prettyDate(date)}</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.map((event) => {
              const cfg = categoryConfig[event.category];
              const Icon = cfg.icon;
              return (
                <div key={event.id} className="flex gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 ${cfg.color}`}>
                      <Icon size={18} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                      {event.status && (
                        <Badge color={statusBadgeColor[event.status] ?? "slate"}>{event.status.replace(/_/g, " ")}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{event.detail}</p>
                    {(event.meta || event.branchName || event.actor) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        {event.meta && <span>{event.meta}</span>}
                        {event.branchName && <span>· {event.branchName}</span>}
                        {event.actor && <span>· by {event.actor}</span>}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 pt-1 text-right">
                    <p className="text-xs font-medium text-slate-500 whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(event.timestamp).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
