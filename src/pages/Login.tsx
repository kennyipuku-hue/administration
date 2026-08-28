import { useState } from "react";
import { HeartPulse, LogIn } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

interface Props {
  onNeedSetup: () => void;
}

export function Login({ onNeedSetup }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      if (err.includes("Invalid login")) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err);
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
            <HeartPulse size={26} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-900">Medical GP Practice</h1>
            <p className="text-sm text-slate-500">Management System</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Sign In</h2>
          <p className="mb-6 text-sm text-slate-500">Enter your credentials to access the practice dashboard.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email Address" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@practice.co.za" autoComplete="email" />
            </Field>
            <Field label="Password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              <LogIn size={18} />
              Sign In
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <button onClick={onNeedSetup} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              First-time setup? Create Super Admin account
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          MEDICAL GP — PRACTICE AND PARTNERS INC
        </p>
      </div>
    </div>
  );
}
