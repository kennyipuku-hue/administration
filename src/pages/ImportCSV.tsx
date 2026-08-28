import { useState, useRef } from "react";
import { FileUp, Upload, CheckCircle2, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Card, PageHeader, Badge } from "@/components/ui";
import { generatePatientNumber } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { Branch, Employee } from "@/types";

interface RowResult {
  row: number;
  patient: string;
  status: "success" | "error";
  message: string;
}

export function ImportCSV() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<RowResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  function downloadTemplate() {
    const headers = ["first_name", "surname", "date_of_birth", "gender", "id_number", "phone", "email", "address", "city", "province", "postal_code", "blood_type", "allergies", "chronic_conditions", "medications", "branch", "assigned_doctor", "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone"];
    const csv = headers.join(",") + "\n" + "John,Smith,1990-05-15,Male,9005151234081,0821234567,john@email.com,123 Main St,Middelburg,Mpumalanga,1050,O+,None,None,Aspirin,Middelburg Branch,Dr PJCA Mbizi,Jane Smith,Spouse,0834567890\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patient_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setProcessing(true);
    setResults([]);

    // Load branches and doctors for resolution
    const [{ data: branches }, { data: doctors }, { data: ebs }] = await Promise.all([
      supabase.from("branches").select("*").eq("status", "active"),
      supabase.from("employees").select("*").eq("position", "Doctor").eq("status", "active"),
      supabase.from("employee_branches").select("employee_id, branch_id").eq("status", "active"),
    ]);
    const branchList = (branches ?? []) as Branch[];
    const doctorList = (doctors ?? []) as Employee[];
    const ebList = ebs ?? [];

    function findBranch(name: string): Branch | undefined {
      const clean = name.trim().toLowerCase();
      return branchList.find((b) => b.branch_name.toLowerCase() === clean || b.branch_code.toLowerCase() === clean);
    }

    function findDoctor(name: string, branchId?: string): Employee | undefined {
      const clean = name.trim().toLowerCase().replace(/^dr\.?\s+/i, "");
      const matches = doctorList.filter((d) => {
        const full = `${d.first_name} ${d.surname}`.toLowerCase();
        const fullWithDr = `dr ${full}`;
        return full === clean || fullWithDr === clean || clean.includes(d.surname.toLowerCase());
      });
      if (matches.length === 0) return undefined;
      if (branchId) {
        const branchMatch = matches.find((d) => ebList.some((eb) => eb.employee_id === d.id && eb.branch_id === branchId) || d.branch_id === branchId);
        return branchMatch ?? matches[0];
      }
      return matches[0];
    }

    function parseCSV(text: string): string[][] {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
          if (char === '"') {
            if (text[i + 1] === '"') { cell += '"'; i++; }
            else inQuotes = false;
          } else cell += char;
        } else {
          if (char === '"') inQuotes = true;
          else if (char === ",") { row.push(cell); cell = ""; }
          else if (char === "\n" || char === "\r") {
            if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
            if (char === "\r" && text[i + 1] === "\n") i++;
          } else cell += char;
        }
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((c) => c.trim()));
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      setResults([{ row: 0, patient: "", status: "error", message: "CSV file is empty or has no data rows" }]);
      setProcessing(false);
      return;
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const dataRows = rows.slice(1);
    const newResults: RowResult[] = [];
    let successCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const get = (key: string) => {
        const idx = headers.indexOf(key);
        return idx >= 0 ? (row[idx] ?? "").trim() : "";
      };
      const firstName = get("first_name");
      const surname = get("surname");
      const branchName = get("branch");
      const doctorName = get("assigned_doctor");
      const patientLabel = `${firstName} ${surname}`.trim() || `Row ${i + 2}`;

      if (!firstName || !surname) {
        newResults.push({ row: i + 2, patient: patientLabel, status: "error", message: "Missing first_name or surname" });
        continue;
      }
      if (!branchName) {
        newResults.push({ row: i + 2, patient: patientLabel, status: "error", message: "Missing branch column" });
        continue;
      }

      const branch = findBranch(branchName);
      if (!branch) {
        newResults.push({ row: i + 2, patient: patientLabel, status: "error", message: `Branch "${branchName}" not found` });
        continue;
      }

      let assignedDoctorId: string | null = null;
      if (doctorName) {
        const doctor = findDoctor(doctorName, branch.id);
        if (!doctor) {
          newResults.push({ row: i + 2, patient: patientLabel, status: "error", message: `Assigned doctor "${doctorName}" does not exist` });
          continue;
        }
        assignedDoctorId = doctor.id;
      }

      const patientNumber = generatePatientNumber();
      const { data: inserted, error } = await supabase.from("patients").insert({
        patient_number: patientNumber,
        first_name: firstName, surname,
        date_of_birth: get("date_of_birth") || null,
        gender: (get("gender") as "Male" | "Female" | "Other" | "") || "",
        id_number: get("id_number") || null,
        phone: get("phone") || null, email: get("email") || null,
        address: get("address") || null, city: get("city") || null, province: get("province") || null, postal_code: get("postal_code") || null,
        blood_type: get("blood_type") || null, allergies: get("allergies") || null,
        chronic_conditions: get("chronic_conditions") || null, medications: get("medications") || null,
        branch_id: branch.id, assigned_doctor_id: assignedDoctorId,
      }).select().single();

      if (error) {
        newResults.push({ row: i + 2, patient: patientLabel, status: "error", message: error.message });
        continue;
      }

      // Emergency contact
      const ecName = get("emergency_contact_name");
      if (ecName) {
        await supabase.from("patient_emergency_contacts").insert({
          patient_id: inserted.id, contact_name: ecName,
          relationship: get("emergency_contact_relationship") || null,
          phone: get("emergency_contact_phone") || null,
        });
      }

      await logAudit("patient_imported", "patient", inserted.id, { patient_number: patientNumber, name: patientLabel });
      newResults.push({ row: i + 2, patient: patientLabel, status: "success", message: `Imported as ${patientNumber}` });
      successCount++;
    }

    setResults(newResults);
    setProcessing(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div>
      <PageHeader title="Import Patients (CSV)" subtitle="Bulk import patients with automatic branch and doctor resolution" />

      <div className="max-w-3xl space-y-6">
        <Card className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">CSV Template</h3>
              <p className="mt-1 text-xs text-slate-500">Download the template to see the required columns. Branch and doctor names must match existing records.</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download size={14} /> Template</Button>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700 mb-1">Required columns:</p>
            <p><code className="text-teal-700">first_name, surname, branch</code> — all other columns are optional.</p>
            <p className="mt-1"><code className="text-teal-700">branch</code> must match a branch name (e.g. "Middelburg Branch") or code (e.g. "MID").</p>
            <p className="mt-1"><code className="text-teal-700">assigned_doctor</code> must match a doctor name (e.g. "Dr PJCA Mbizi"). If not found, the row will report an error.</p>
          </div>
        </Card>

        <Card className="p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 cursor-pointer transition-colors ${dragOver ? "border-teal-400 bg-teal-50" : "border-slate-300 hover:border-slate-400"}`}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Upload size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">{fileName || "Click to upload or drag a CSV file here"}</p>
            <p className="mt-1 text-xs text-slate-400">Only .csv files are accepted</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        </Card>

        {processing && (
          <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Processing CSV...
          </div>
        )}

        {results.length > 0 && !processing && (
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-500" /><span className="text-sm font-medium text-slate-700">{successCount} imported</span></div>
              {errorCount > 0 && <div className="flex items-center gap-2"><AlertCircle size={18} className="text-red-500" /><span className="text-sm font-medium text-slate-700">{errorCount} errors</span></div>}
            </div>
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${r.status === "success" ? "bg-emerald-50" : "bg-red-50"}`}>
                  <div className="flex items-center gap-3">
                    {r.status === "success" ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-red-500" />}
                    <div>
                      <span className="font-medium text-slate-700">Row {r.row}: {r.patient}</span>
                      <span className="ml-2 text-xs text-slate-500">{r.message}</span>
                    </div>
                  </div>
                  <Badge color={r.status === "success" ? "green" : "red"}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
