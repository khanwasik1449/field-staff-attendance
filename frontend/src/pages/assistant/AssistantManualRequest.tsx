import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { ManualAttendanceRequest } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { FileQuestion, Send, CheckCircle2, AlertCircle, LogIn, LogOut } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ManualRequestType } from '../../types';

export const AssistantManualRequest: React.FC = () => {
  const [requests, setRequests] = useState<ManualAttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // The history page links here with ?date=YYYY-MM-DD&type=MISSED_CHECK_IN|OUT so
  // the form opens on the exact day and correction type that needs attention.
  // Both params are ignored unless well-formed, so a hand-edited or stale link
  // can never prefill the form with nonsense.
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const missedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const typeParam = searchParams.get('type');
  const initialType: ManualRequestType =
    typeParam === 'MISSED_CHECK_OUT' ? 'MISSED_CHECK_OUT' : 'MISSED_CHECK_IN';

  const [requestType, setRequestType] = useState<ManualRequestType>(initialType);

  // Form inputs
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const [date, setDate] = useState(missedDate || yesterday);
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [checkOutTime, setCheckOutTime] = useState('17:00');
  const [reason, setReason] = useState(
    initialType === 'MISSED_CHECK_OUT'
      ? 'Forgot to check out during field duty.'
      : 'Forgot to check in upon arrival.'
  );
  const [remarks, setRemarks] = useState('');

  const isCheckOutOnly = requestType === 'MISSED_CHECK_OUT';

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

  const handleTypeChange = (next: ManualRequestType) => {
    setRequestType(next);
    setReason(
      next === 'MISSED_CHECK_OUT'
        ? 'Forgot to check out during field duty.'
        : 'Forgot to check in upon arrival.'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      // Create ISO strings in Asia/Dhaka (+06:00 offset)
      const reqCheckOut = `${date}T${checkOutTime}:00+06:00`;

      const payload: Record<string, unknown> = {
        attendance_date: date,
        request_type: requestType,
        requested_check_out: reqCheckOut,
        reason,
        remarks,
      };

      // A check-out-only request must NOT send a check-in: the existing
      // server-recorded check-in is preserved by the backend.
      payload.requested_check_in = isCheckOutOnly
        ? null
        : `${date}T${checkInTime}:00+06:00`;

      const res = await apiClient.post('/manual-requests/', payload);

      setFeedback({ type: 'success', message: res.data.detail });
      setRemarks('');
      await fetchMyRequests();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const reasonPresets = isCheckOutOnly
    ? [
      'Forgot to check out during field duty.',
      'Mobile battery depleted during field duty.',
      'Device network connectivity issue in remote area.',
      'Assigned urgent field dispatch without phone access.',
      'System error during mobile check-out.',
      'Other',
    ]
    : [
      'Forgot to check in upon arrival.',
      'Mobile battery depleted during field duty.',
      'Device network connectivity issue in remote area.',
      'Assigned urgent field dispatch without phone access.',
      'System error during mobile check-in.',
      'Other',
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
          {/* Correction type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              What needs correcting?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('MISSED_CHECK_IN')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors min-h-[64px] ${
                  !isCheckOutOnly
                    ? 'border-rose-500 bg-rose-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-rose-700">
                  <LogIn className="w-3.5 h-3.5" /> Missed Check-In
                </span>
                <span className="text-[10px] text-slate-500 leading-tight">
                  No record for a working day
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('MISSED_CHECK_OUT')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors min-h-[64px] ${
                  isCheckOutOnly
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-amber-700">
                  <LogOut className="w-3.5 h-3.5" /> Missed Check-Out
                </span>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Checked in, never checked out
                </span>
              </button>
            </div>
          </div>

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
            <p className="text-[10px] text-slate-400 mt-1">
              Must be a configured working day for a missed check-in request.
            </p>
          </div>

          {isCheckOutOnly ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-900 leading-relaxed font-medium">
                  Your existing check-in for this day is kept exactly as recorded by the
                  server, together with its location. You only supply the check-out time.
                </p>
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
          ) : (
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
          )}

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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900">
                    {r.attendance_date}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        r.request_type === 'MISSED_CHECK_OUT'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {r.request_type_display}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                </div>

                <div className="text-xs text-slate-600 flex items-center gap-4 flex-wrap">
                  <span>
                    In:{' '}
                    <strong className={r.requested_check_in ? '' : 'text-blue-600'}>
                      {r.requested_check_in_display}
                    </strong>
                  </span>
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
