import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Login } from "@/pages/Login";
import { InitialSetup } from "@/pages/InitialSetup";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Dashboard } from "@/pages/Dashboard";
import { Branches } from "@/pages/Branches";
import { Employees } from "@/pages/Employees";
import { Patients } from "@/pages/Patients";
import { RegisterPatient } from "@/pages/RegisterPatient";
import { ImportCSV } from "@/pages/ImportCSV";
import { Appointments } from "@/pages/Appointments";
import { AppointmentRequestsPage } from "@/pages/AppointmentRequestsPage";
import { Queue } from "@/pages/Queue";
import { Inquiries } from "@/pages/Inquiries";
import { DailyReport } from "@/pages/DailyReport";
import { AuditLogs } from "@/pages/AuditLogs";
import { SettingsPage } from "@/pages/SettingsPage";
import { UserManagement } from "@/pages/UserManagement";

const MAINTENANCE_MODE = true;

function MaintenancePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="max-w-xl text-center">

        <p className="mb-4 text-8xl font-black tracking-tight text-teal-400 sm:text-9xl">
          404
        </p>

        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Oops! We couldn't find the page you're looking for.
        </h1>

        <p className="mx-auto mb-8 max-w-lg text-base leading-7 text-slate-400">
          The page you are trying to access may have been moved, removed,
          or is temporarily unavailable.
        </p>

        <div className="inline-flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900 px-5 py-3 text-sm text-slate-300">
          <span className="h-2 w-2 rounded-full bg-teal-400" />
          Please contact the administrator for assistance.
        </div>

      </div>
    </div>
  );
}

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    (async () => {
      // Check if a super_admin exists via the edge function, which uses the
      // service-role key and bypasses RLS. A direct client query to user_profiles
      // returns nothing for unauthenticated users (RLS blocks it), which would
      // incorrectly trigger the setup page even when a super admin exists.
      try {
        const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/super-admin-setup`;
        const res = await fetch(funcUrl, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        });
        const data = await res.json();
        if (res.ok && data.superAdminExists !== undefined) {
          setNeedsSetup(!data.superAdminExists);
        } else {
          // If the edge function fails, fall back to showing the login page
          // rather than the setup page — this is safer when an admin exists.
          setNeedsSetup(false);
        }
      } catch {
        setNeedsSetup(false);
      }
      setCheckingSetup(false);
    })();
  }, []);

  // When not logged in and setup is needed and user clicked the setup link
  if (checkingSetup || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // First-run setup: show the setup page automatically if no super admin exists
  // or if user manually clicked the setup link
  if (!session && (needsSetup || showSetup)) {
    return <InitialSetup onSuccess={() => { setShowSetup(false); setNeedsSetup(false); }} />;
  }

  if (!session) {
    return <Login onNeedSetup={() => setShowSetup(true)} />;
  }

  // Logged in but no profile (shouldn't normally happen, but guard)
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-sm text-slate-600">Your account exists but has no profile. Please contact an administrator.</p>
        </div>
      </div>
    );
  }

  // All authenticated users have access to every page.
  // Delete actions for users and patients are gated to super_admin only
  // within the page components themselves, and enforced by RLS policies.
  function canAccess(_pageName: string): boolean {
    return true;
  }

  // Reset to dashboard if current page is not accessible
  if (!canAccess(page)) {
    setPage("dashboard");
  }

  function renderPage() {
    switch (page) {
      case "dashboard": return <Dashboard onNavigate={setPage} />;
      case "branches": return <Branches />;
      case "employees": return <Employees />;
      case "patients": return <Patients onRegister={() => setPage("register")} />;
      case "register": return <RegisterPatient onDone={() => setPage("patients")} />;
      case "import": return <ImportCSV />;
      case "appointments": return <Appointments />;
      case "queue": return <Queue />;
      case "inquiries": return <Inquiries />;
      case "report": return <DailyReport />;
      case "audit": return <AuditLogs />;
      case "settings": return <SettingsPage />;
      case "users": return <UserManagement />;
      case "appointment-requests": return <AppointmentRequestsPage />;
      default: return <Dashboard onNavigate={setPage} />;
    }
  }

  return (
    <DashboardLayout currentPage={page} onNavigate={setPage}>
      {renderPage()}
    </DashboardLayout>
  );
}

export default function App() {
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />;
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
