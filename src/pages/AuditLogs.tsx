import { useEffect, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Badge, Input, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/types";

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      setLogs(data as AuditLog[] ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.action.toLowerCase().includes(s) || (l.actor_email ?? "").toLowerCase().includes(s) || (l.entity_type ?? "").toLowerCase().includes(s);
  });

  const actionColors: Record<string, "teal" | "blue" | "green" | "red" | "amber" | "slate"> = {
    super_admin_created: "teal",
    patient_registered: "green",
    patient_imported: "green",
    patient_updated: "amber",
    branch_created: "blue",
    branch_updated: "amber",
    employee_created: "blue",
    employee_updated: "amber",
    appointment_created: "blue",
    appointment_status_changed: "amber",
  };

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="System activity and change history" />

      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by action, email, or entity..." className="pl-9" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading logs...</div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList size={48} />} title="No audit logs" description="System actions will appear here." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-3"><Badge color={actionColors[l.action] ?? "slate"}>{l.action.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{l.actor_email ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{l.entity_type ?? "—"}{l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{l.details ? JSON.stringify(l.details) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
