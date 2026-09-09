import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCog,
  CalendarDays,
  FileUp,
  Stethoscope,
  ClipboardList,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  HeartPulse,
  ListOrdered,
  Inbox,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin, canManage, fullName } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotifications } from "@/lib/useNotifications";

interface NavItem {
  label: string;
  icon: ReactNode;
  page: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={18} />, page: "dashboard" },
  { label: "Patients", icon: <Users size={18} />, page: "patients" },
  { label: "Register Patient", icon: <HeartPulse size={18} />, page: "register" },
  { label: "Import CSV", icon: <FileUp size={18} />, page: "import" },
  { label: "Appointments", icon: <CalendarDays size={18} />, page: "appointments" },
  { label: "Appointment Requests", icon: <CalendarDays size={18} />, page: "appointment-requests" },
  { label: "Queue", icon: <ListOrdered size={18} />, page: "queue" },
  { label: "Inquiries", icon: <Inbox size={18} />, page: "inquiries" },
  { label: "Daily Report", icon: <FileText size={18} />, page: "report" },
  { label: "Doctors & Staff", icon: <Stethoscope size={18} />, page: "employees" },
  { label: "Branches", icon: <Building2 size={18} />, page: "branches" },
  { label: "User Management", icon: <UserCog size={18} />, page: "users" },
  { label: "Audit Logs", icon: <ClipboardList size={18} />, page: "audit" },
  { label: "Settings", icon: <Settings size={18} />, page: "settings" },
];

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

export function DashboardLayout({ currentPage, onNavigate, children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = profile?.role;
  const { counts } = useNotifications();

  const visibleItems = navItems.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin(role)) return false;
    if (item.adminOnly && !canManage(role)) return false;
    return true;
  });

  const roleLabel = role === "super_admin" ? "Super Admin" : role === "admin" ? "Administrator" : "Viewer";
  const roleBadgeColor = role === "super_admin" ? "bg-teal-100 text-teal-700" : role === "admin" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600";

  function handleNav(page: string) {
    onNavigate(page);
    setMobileOpen(false);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
          <HeartPulse size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">Medical GP</p>
          <p className="truncate text-xs text-slate-500">Practice Management</p>
        </div>
        <NotificationBell onNavigate={handleNav} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = currentPage === item.page;
          const badge = counts[item.page];
          return (
            <button
              key={item.page}
              onClick={() => handleNav(item.page)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span className={active ? "text-teal-600" : "text-slate-400"}>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {badge != null && badge > 0 && (
                <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
                  item.page === "inquiries" ? "bg-amber-500" : item.page === "queue" ? "bg-teal-500" : "bg-amber-500"
                }`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            {profile ? profile.first_name[0] : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{profile ? fullName(profile.first_name, profile.surname) : ""}</p>
            <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut size={18} className="text-slate-400" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 text-slate-400">
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-slate-600">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-teal-600" />
            <span className="text-sm font-semibold text-slate-900">Medical GP</span>
          </div>
          <NotificationBell onNavigate={handleNav} />
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
