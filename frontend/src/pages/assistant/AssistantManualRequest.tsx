import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { ManualAttendanceRequest } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { FileQuestion, Send, CheckCircle2, AlertCircle, Clock, Calendar, HelpCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

export const AssistantManualRequest: React.FC = () => {
  const [requests, setRequests] = useState<ManualAttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // The dashboard links here with ?date=YYYY-MM-DD when a check-out was missed,
  // so the form opens on the duty day that actually needs correcting.
  // The param is ignored unless it is a well-formed date, so a hand-edited or
  // stale link can never prefill the form with nonsense.
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const missedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  // Form inputs
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const [date, setDate] = useState(missedDate || yesterday);
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [checkOutTime, setCheckOutTime] = useState('17:00');
  const [reason, setReason] = useState(
    missedDate ? 'Forgot to check out during field duty.' : 'Forgot to check in.'
  );
  const [remarks, setRemarks] = useState('');

  const fetchMyRequests = async () => {
    try {
      const res = await apiClient.get('/manual-requests/my-requests/');
      setRequests(res.data.results || res.data);
    } catch (err) {
      // Ignored on initial
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      // Create ISO strings in Asia/Dhaka (+06:00 offset)
      const reqCheckIn = `${date}T${checkInTime}:00+06:00`;
      const reqCheckOut = `${date}T${checkOutTime}:00+06:00`;

      const res = await apiClient.post('/manual-requests/', {
        attendance_date: date,
        requested_check_in: reqCheckIn,
        requested_check_out: reqCheckOut,
        reason,
        remarks,
      });

      setFeedback({ type: 'success', message: res.data.detail });
      setRemarks('');
      await fetchMyRequests();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const reasonPresets = [
    'Forgot to check out during field duty.',
    'Forgot to check in upon arrival.',
    'Mobile battery depleted during field duty.',
    'Device network connectivity issue in remote area.',
    'Assigned urgent field dispatch without phone access.',
    'System error during mobile check-in.',
    'Other'
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Manual Attendance</h1>
          <p className="text-xs text-slate-500">Request attendance correction or retroactive submission</p>
        </div>
        <Link
          to="/assistant"
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
        >
          ← Back to Today
        </Link>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-start gap-3 shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{feedback.message}</div>
        </div>
      )}

      {/* Submission Form Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <FileQuestion className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">Submit Attendance Request</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Attendance Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Check-In
              </label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Check-Out
              </label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Primary Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {reasonPresets.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Details / Remarks (Optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Provide field context, location, or supervisor verification info..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full touch-btn py-3 px-4 rounded-xl text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting Request...' : 'Submit to Administrator'}
          </button>
        </form>
      </div>

      {/* Submitted Requests List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider px-1">
          Submitted Request Queue
        </h3>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
            No previous manual attendance requests submitted.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">
                    {r.attendance_date}
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                <div className="text-xs text-slate-600 flex items-center gap-4">
                  <span>In: <strong>{r.requested_check_in_display}</strong></span>
                  <span>Out: <strong>{r.requested_check_out_display}</strong></span>
                </div>

                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Reason:</span> {r.reason}
                </div>

                {r.admin_remarks && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200">
                    <span className="font-bold text-slate-800">Admin Remarks:</span> {r.admin_remarks}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
