import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Field, Input, Textarea } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { canManage } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { SystemSettings } from "@/types";

export function SettingsPage() {
  const { profile } = useAuth();
  const canEdit = canManage(profile?.role);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [practiceName, setPracticeName] = useState("");
  const [practiceEmail, setPracticeEmail] = useState("");
  const [practicePhone, setPracticePhone] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [hours, setHours] = useState<Record<string, string>>({});
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState("");
  const [popiaNotice, setPopiaNotice] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_settings").select("*").limit(1).maybeSingle();
      if (data) {
        const s = data as SystemSettings;
        setSettings(s);
        setPracticeName(s.practice_name);
        setPracticeEmail(s.practice_email ?? "");
        setPracticePhone(s.practice_phone ?? "");
        setPracticeAddress(s.practice_address ?? "");
        setHours(s.operating_hours ?? {});
        setServices(s.services ?? []);
        setPopiaNotice(s.popia_notice ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from("system_settings").update({
      practice_name: practiceName, practice_email: practiceEmail || null, practice_phone: practicePhone || null,
      practice_address: practiceAddress || null, operating_hours: hours, services, popia_notice: popiaNotice || null,
    }).eq("id", settings.id);
    if (!error) {
      await logAudit("settings_updated", "system_settings", settings.id, {});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  function addService() {
    if (newService.trim() && !services.includes(newService.trim())) {
      setServices([...services, newService.trim()]);
      setNewService("");
    }
  }
  function removeService(s: string) { setServices(services.filter((x) => x !== s)); }

  const hourFields = [
    { key: "mon_friday", label: "Monday – Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
    { key: "public_holiday", label: "Public Holidays" },
  ];

  if (loading) return <div className="text-center py-12 text-slate-400">Loading settings...</div>;

  return (
    <div>
      <PageHeader title="System Settings" subtitle="Configure practice-wide information and operating hours" />

      <form onSubmit={save} className="max-w-3xl space-y-6">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Practice Information</h3>
          <div className="space-y-4">
            <Field label="Practice Name"><Input value={practiceName} onChange={(e) => setPracticeName(e.target.value)} disabled={!canEdit} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Practice Email"><Input type="email" value={practiceEmail} onChange={(e) => setPracticeEmail(e.target.value)} disabled={!canEdit} /></Field>
              <Field label="Practice Phone"><Input value={practicePhone} onChange={(e) => setPracticePhone(e.target.value)} disabled={!canEdit} /></Field>
            </div>
            <Field label="Practice Address"><Input value={practiceAddress} onChange={(e) => setPracticeAddress(e.target.value)} disabled={!canEdit} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Operating Hours</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {hourFields.map((h) => (
              <Field key={h.key} label={h.label}>
                <Input value={hours[h.key] ?? ""} onChange={(e) => setHours({ ...hours, [h.key]: e.target.value })} placeholder="e.g. 08:00-17:00 or Closed" disabled={!canEdit} />
              </Field>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Services Offered</h3>
          <div className="space-y-2">
            {services.map((s) => (
              <div key={s} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{s}</span>
                {canEdit && <button type="button" onClick={() => removeService(s)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="mt-3 flex gap-2">
              <Input value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="Add a service..." onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addService(); } }} />
              <Button type="button" variant="secondary" onClick={addService}><Plus size={16} /></Button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">POPIA / Privacy Notice</h3>
          <Field label="Patient Privacy Notice">
            <Textarea rows={4} value={popiaNotice} onChange={(e) => setPopiaNotice(e.target.value)} disabled={!canEdit} />
          </Field>
        </Card>

        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-600">Settings saved</span>}
            <Button type="submit" loading={saving}><Save size={16} /> Save Settings</Button>
          </div>
        )}
      </form>
    </div>
  );
}
