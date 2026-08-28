import { useState } from "react";
import { HeartPulse, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase";

interface Props {
  onSuccess: () => void;
}

export function InitialSetup({ onSuccess }: Props) {
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordChecks = [
    { label: "At least 12 characters", pass: password.length >= 12 },
    { label: "Contains uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Contains a number", pass: /[0-9]/.test(password) },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !surname.trim()) {
      setError("First name and surname are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/super-admin-setup`;
      const res = await fetch(funcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ firstName, surname, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Setup failed");
      }
      setSuccess(true);
      setTimeout(onSuccess, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin Created</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your Super Admin account has been created successfully. Redirecting you to the login page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
            <HeartPulse size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Medical GP Practice</h1>
            <p className="text-xs text-slate-500">Management System</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Initial Setup</h2>
              <p className="text-sm text-slate-500">Create the first Super Admin account to get started.</p>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-800">
              This page is only available when no Super Admin exists. After setup, this route is permanently locked.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </Field>
              <Field label="Surname" required>
                <Input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Doe" autoComplete="family-name" />
              </Field>
            </div>
            <Field label="Email Address" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@practice.co.za" autoComplete="email" />
            </Field>
            <Field label="Password" required hint="Choose a strong password (min 12 characters)">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="new-password" />
            </Field>
            {password.length > 0 && (
              <div className="space-y-1">
                {passwordChecks.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 size={14} className={c.pass ? "text-emerald-500" : "text-slate-300"} />
                    <span className={c.pass ? "text-emerald-700" : "text-slate-400"}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
            <Field label="Confirm Password" required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••••" autoComplete="new-password" />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Create Super Admin Account
              <ArrowRight size={18} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
