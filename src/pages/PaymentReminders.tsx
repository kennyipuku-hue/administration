
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type PaymentReminder = {
  id: string;
  cycle_number: number;
  due_date: string;
  status: "unpaid" | "paid";
  paid_at: string | null;
  notes: string | null;
};

export function PaymentReminders() {
    const { role, user } = useAuth();

const canMarkPaid =
  role === "super_admin" || role === "admin";

  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReminders() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("doctor_payment_reminders")
        .select(
          "id, cycle_number, due_date, status, paid_at, notes"
        )
        .order("due_date", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setReminders((data ?? []) as PaymentReminder[]);
      }

      setLoading(false);
    }

    loadReminders();
  }, []);

  async function markAsPaid(reminderId: string) {
  if (!canMarkPaid || !user) return;

  const confirmed = window.confirm(
    "Are you sure you want to mark this payment as paid?"
  );

  if (!confirmed) return;

  setError("");

  const { error: updateError } = await supabase
    .from("doctor_payment_reminders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      confirmed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId)
    .eq("status", "unpaid");

  if (updateError) {
    setError(`Could not update payment: ${updateError.message}`);
    return;
  }

  const { data, error: reloadError } = await supabase
    .from("doctor_payment_reminders")
    .select("id, cycle_number, due_date, status, paid_at, notes")
    .order("due_date", { ascending: false });

  if (reloadError) {
    setError(`Payment was updated, but the list could not refresh: ${reloadError.message}`);
    return;
  }

  setReminders((data ?? []) as PaymentReminder[]);
}

  const unpaid = reminders.filter(
    (reminder) => reminder.status === "unpaid"
  );

  const paid = reminders.filter(
    (reminder) => reminder.status === "paid"
  );

  function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString(
      "en-ZA",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Payment Reminders
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track upcoming and completed practice payments.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">
            Outstanding reminders
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-900">
            {unpaid.length}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-800">
            Payments recorded as paid
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-900">
            {paid.length}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">
          Loading payment reminders...
        </p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load reminders: {error}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Outstanding payments
            </h2>

            {unpaid.length === 0 ? (
              <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
                There are no outstanding payment reminders.
              </p>
            ) : (
              unpaid.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      Payment reminder #{reminder.cycle_number}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Due: {formatDate(reminder.due_date)}
                    </p>
                    {reminder.notes && (
                      <p className="mt-1 text-sm text-slate-500">
                        {reminder.notes}
                      </p>
                    )}
                  </div>

                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Unpaid
                  </span>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Payment history
            </h2>

            {paid.length === 0 ? (
              <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
                No payments have been marked as paid yet.
              </p>
            ) : (
              paid.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      Payment reminder #{reminder.cycle_number}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Due: {formatDate(reminder.due_date)}
                    </p>
                    {reminder.paid_at && (
                      <p className="mt-1 text-sm text-slate-500">
                        Paid on: {formatDate(reminder.paid_at.slice(0, 10))}
                      </p>
                    )}
                  </div>

                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                    Paid
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
