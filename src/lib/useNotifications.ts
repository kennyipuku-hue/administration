import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Inquiry, QueueEntry } from "@/types";

export interface AppNotification {
  id: string;
  type: "inquiry" | "queue" | "appointment";
  title: string;
  description: string;
  createdAt: string;
  page: string;
}

export type PageCounts = Record<string, number>;

const DISMISSED_KEY = "dismissed_notifications";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function recomputeCounts(notifications: AppNotification[]): PageCounts {
  const counts: PageCounts = {};
  notifications.forEach((n) => {
    counts[n.page] = (counts[n.page] ?? 0) + 1;
  });
  return counts;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState<PageCounts>({});
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch + polling for queue/appointments (these change status
  // frequently so polling is appropriate). Inquiries use realtime instead.
  const fetchNotifications = useCallback(async () => {
    const dismissed = loadDismissed();
    const today = new Date().toISOString().slice(0, 10);

    const [inqRes, queueRes, apptRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("id, patient_name, subject, created_at, status")
        .eq("status", "New")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("patient_queue")
        .select("id, queue_number, checked_in_at, status, patient:patients!patient_queue_patient_id_fkey(first_name, surname)")
        .eq("status", "waiting")
        .order("checked_in_at", { ascending: false })
        .limit(20),
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, status, reason, patient:patients!appointments_patient_id_fkey(first_name, surname)")
        .eq("appointment_date", today)
        .eq("status", "scheduled")
        .order("appointment_time", { ascending: true })
        .limit(20),
    ]);

    const inqNotifications: AppNotification[] = (inqRes.data as Inquiry[] ?? [])
      .filter((i) => !dismissed.has(`inquiry:${i.id}`))
      .map((i) => ({
        id: `inquiry:${i.id}`,
        type: "inquiry" as const,
        title: `New inquiry from ${i.patient_name}`,
        description: i.subject,
        createdAt: i.created_at,
        page: "inquiries",
      }));

    const queueNotifications: AppNotification[] = (queueRes.data as unknown as QueueEntry[] ?? [])
      .filter((q) => !dismissed.has(`queue:${q.id}`))
      .map((q) => ({
        id: `queue:${q.id}`,
        type: "queue" as const,
        title: `Patient #${q.queue_number} in queue`,
        description: q.patient ? `${q.patient.first_name} ${q.patient.surname}` : "Unknown patient",
        createdAt: q.checked_in_at,
        page: "queue",
      }));

    const apptNotifications: AppNotification[] = (apptRes.data as unknown as { id: string; appointment_date: string; appointment_time: string; status: string; reason: string | null; patient: { first_name: string; surname: string } | null }[] ?? [])
      .filter((a) => !dismissed.has(`appointment:${a.id}`))
      .map((a) => ({
        id: `appointment:${a.id}`,
        type: "appointment" as const,
        title: `Appointment today${a.patient ? ` — ${a.patient.first_name} ${a.patient.surname}` : ""}`,
        description: `${a.appointment_time.slice(0, 5)}${a.reason ? ` · ${a.reason}` : ""}`,
        createdAt: `${a.appointment_date}T${a.appointment_time}`,
        page: "appointments",
      }));

    const all = [...inqNotifications, ...queueNotifications, ...apptNotifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setNotifications(all);
    setCounts(recomputeCounts(all));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Realtime subscription for new inquiry INSERTs
    // Only works for authenticated users — anon key users won't receive events
    // because the inquiries table RLS blocks anon SELECT.
    const channel = supabase
      .channel("inquiry-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiries" },
        (payload) => {
          const newInquiry = payload.new as Inquiry;
          const notifId = `inquiry:${newInquiry.id}`;
          const dismissed = loadDismissed();
          if (dismissed.has(notifId)) return;

          const notif: AppNotification = {
            id: notifId,
            type: "inquiry",
            title: `New inquiry from ${newInquiry.patient_name}`,
            description: newInquiry.subject,
            createdAt: newInquiry.created_at,
            page: "inquiries",
          };

          setNotifications((prev) => {
            if (prev.some((n) => n.id === notifId)) return prev;
            const next = [notif, ...prev].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            setCounts(recomputeCounts(next));
            return next;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Slower polling interval for queue/appointments (every 60s instead of 30s)
    // since inquiries now use realtime
    const interval = setInterval(fetchNotifications, 60000);

    return () => {
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchNotifications]);

  const dismiss = useCallback((id: string) => {
    const dismissed = loadDismissed();
    dismissed.add(id);
    saveDismissed(dismissed);
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      setCounts(recomputeCounts(next));
      return next;
    });
  }, []);

  const dismissByPage = useCallback((page: string) => {
    setNotifications((prev) => {
      const toDismiss = prev.filter((n) => n.page === page);
      if (toDismiss.length === 0) return prev;
      const dismissed = loadDismissed();
      toDismiss.forEach((n) => dismissed.add(n.id));
      saveDismissed(dismissed);
      const next = prev.filter((n) => n.page !== page);
      setCounts(recomputeCounts(next));
      return next;
    });
  }, []);

  return { notifications, counts, loading, dismiss, dismissByPage, refresh: fetchNotifications };
}
