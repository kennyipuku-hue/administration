import { useEffect, useState } from "react";
import { CalendarDays, Clock, Mail, Phone, User, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function AppointmentRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const approveRequest = async (requestId: string) => {
  const { error } = await supabase
    .from("appointment_requests")
    .update({ status: "approved" })
    .eq("id", requestId);

  if (error) {
    console.error("Approve request error:", error);
    setError(error.message);
    return;
  }

  setRequests((current) =>
    current.map((request) =>
      (request.id || request.uuid) === requestId
        ? { ...request, status: "approved" }
        : request
    )
  );
};

  useEffect(() => {
    async function loadRequests() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("appointment_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Appointment requests error:", error);
        setError(error.message);
      } else {
        setRequests(data || []);
      }

      setLoading(false);
    }

    loadRequests();
  }, []);
const filteredRequests = selectedDate
  ? requests.filter(
      (request) => request.preferred_date === selectedDate
    )
  : requests;
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold text-slate-900">
      Appointment Requests
    </h1>

    <p className="mt-1 text-sm text-slate-500">
      Appointment requests submitted by clients through Website 1.
    </p>
  </div>

  <div>
    <label className="mb-1 block text-xs font-medium text-slate-500">
      Filter by preferred date
    </label>

    <div className="flex items-center gap-2">
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
      />

      {selectedDate && (
        <button
          type="button"
          onClick={() => setSelectedDate("")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      )}
    </div>
  </div>
</div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Loading appointment requests...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-600">
            Error: {error}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />

          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            No appointment requests
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            New requests from Website 1 will appear here.
          </p>
        </div>
      )}

      {/* Requests */}
      {!loading && !error && filteredRequests.length > 0 && (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id || request.uuid}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              {/* Top row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {request.full_name || "Unnamed patient"}
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Request received{" "}
                    {request.created_at
                      ? new Date(request.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  {request.status || "Pending"}
                </span>
              </div>

              {/* Details */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-xs text-slate-400">
                      Patient
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {request.full_name || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-xs text-slate-400">
                      Phone
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {request.phone || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-xs text-slate-400">
                      Email
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {request.email || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-xs text-slate-400">
                      Preferred date
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {request.preferred_date || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-xs text-slate-400">
                      Preferred time
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {request.preferred_time || "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Service
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {request.service || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Consultation
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {request.consultation_preference || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Patient age
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {request.patient_age ?? "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Branch
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {request.preferred_branch_code || "—"}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {request.notes && (
                <div className="mt-5 rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500"> Oui
                    Notes
                  </p>

                  <p className="mt-1 text-sm text-slate-700">
                    {request.notes}
                  </p>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-4">
  <button
  type="button"
  onClick={() => setSelectedRequest(request)}
  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  <Eye size={16} />
  View
</button>
  <button 
    type="button"
    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
    onClick={() => approveRequest(request.id || request.uuid)}
  >
    Approve Request
  </button>
</div>
            </div>
          ))}
        </div>
      )}
      {selectedRequest && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
    <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Appointment Request
          </h2>
          <p className="text-sm text-slate-500">
            Request details
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedRequest(null)}
          className="text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-400">Patient</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.full_name || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Phone</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.phone || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Email</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.email || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Patient age</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.patient_age ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Preferred date</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.preferred_date || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Preferred time</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.preferred_time || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Service</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.service || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Consultation</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.consultation_preference || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Branch</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.preferred_branch_code || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Status</p>
            <p className="text-sm font-medium text-slate-700">
              {selectedRequest.status || "new"}
            </p>
          </div>
        </div>

        {selectedRequest.notes && (
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              Notes
            </p>

            <p className="mt-1 text-sm text-slate-700">
              {selectedRequest.notes}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          onClick={() => setSelectedRequest(null)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>

        <button
          type="button"
          onClick={() => approveRequest(selectedRequest.id || selectedRequest.uuid)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Approve Request
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}