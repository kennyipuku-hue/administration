import { useState, useRef, useEffect } from "react";
import { Bell, Inbox, ListOrdered, CheckCheck, CalendarDays } from "lucide-react";
import { useNotifications } from "@/lib/useNotifications";

interface Props {
  onNavigate: (page: string) => void;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell({ onNavigate }: Props) {
  const { notifications, counts, dismiss, dismissByPage } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const count = notifications.length;
  const inquiryCount = counts.inquiries ?? 0;
  const queueCount = counts.queue ?? 0;
  const apptCount = counts.appointments ?? 0;

  function handleClick(n: typeof notifications[0]) {
    dismiss(n.id);
    onNavigate(n.page);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell size={20} className={count > 0 ? "text-teal-600" : ""} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 animate-ping rounded-full bg-red-400 opacity-75" style={{ animationDuration: "2s" }} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {count > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">{count}</span>
              )}
            </div>
            {count > 0 && (
              <button
                onClick={() => {
                  notifications.forEach((n) => dismiss(n.id));
                }}
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                <CheckCheck size={14} /> Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell size={28} className="mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No new notifications</p>
                <p className="text-xs text-slate-300 mt-0.5">You're all caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      n.type === "inquiry" ? "bg-amber-50 text-amber-600" : n.type === "queue" ? "bg-teal-50 text-teal-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {n.type === "inquiry" ? <Inbox size={16} /> : n.type === "queue" ? <ListOrdered size={16} /> : <CalendarDays size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 truncate">{n.description}</p>
                      <p className="text-[11px] text-slate-300 mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer summary */}
          {count > 0 && (
            <div className="border-t border-slate-200 px-4 py-2.5 flex items-center gap-3 text-xs">
              {inquiryCount > 0 && (
                <button onClick={() => { dismissByPage("inquiries"); onNavigate("inquiries"); setOpen(false); }} className="flex items-center gap-1.5 font-medium text-amber-600 hover:text-amber-700">
                  <Inbox size={13} /> {inquiryCount} inquiry{inquiryCount !== 1 ? "s" : ""}
                </button>
              )}
              {queueCount > 0 && (
                <button onClick={() => { dismissByPage("queue"); onNavigate("queue"); setOpen(false); }} className="flex items-center gap-1.5 font-medium text-teal-600 hover:text-teal-700">
                  <ListOrdered size={13} /> {queueCount} in queue
                </button>
              )}
              {apptCount > 0 && (
                <button onClick={() => { dismissByPage("appointments"); onNavigate("appointments"); setOpen(false); }} className="flex items-center gap-1.5 font-medium text-amber-600 hover:text-amber-700">
                  <CalendarDays size={13} /> {apptCount} today
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
