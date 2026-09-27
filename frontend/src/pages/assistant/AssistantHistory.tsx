import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { MyCalendarResponse, CalendarDay } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Calendar, ChevronLeft, ChevronRight, AlertCircle, MapPin,
  FileQuestion, LogIn, LogOut, Clock3, CheckCircle2, Hourglass
} from 'lucide-react';
import { Link } from 'react-router-dom';

const formatDayLabel = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};

export const AssistantHistory: React.FC = () => {
  const [data, setData] = useState<MyCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      // The server owns the working-day calendar, so it also reports which
      // working days are missing an entry entirely.
      const res = await apiClient.get('/attendance/my-calendar/', {
        params: { month, year },
      });
      setData(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [month, year]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Attendance History</h1>
          <p className="text-xs text-slate-500">Your personal verified attendance records</p>
        </div>
        <Link
          to="/assistant"
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
        >
          ← Back to Today
        </Link>
      </div>

      {/* Month Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center font-bold text-slate-800 text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>{monthNames[month - 1]} {year}</span>
        </div>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          {error}
        </div>
      )}

      {/* Summary strip */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
            <div className="text-lg font-black text-slate-800 font-mono">{data.summary.complete_days}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Complete</div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
            <div className="text-lg font-black text-slate-800 font-mono">{data.summary.total_working_display}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Worked</div>
          </div>
          <div className={`p-3 rounded-xl border text-center ${data.summary.missed_check_in > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
            <div className={`text-lg font-black font-mono ${data.summary.missed_check_in > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {data.summary.missed_check_in}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">No Check-In</div>
          </div>
          <div className={`p-3 rounded-xl border text-center ${data.summary.missed_check_out > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <div className={`text-lg font-black font-mono ${data.summary.missed_check_out > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {data.summary.missed_check_out}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">No Check-Out</div>
          </div>
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : !data || data.days.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
          No working days found for {monthNames[month - 1]} {year}.
        </div>
      ) : (
        <div className="space-y-3">
          {data.days.map((day: CalendarDay) => {
            const att = day.attendance;
            const hasIssue = Boolean(day.issue);
            const isPending = day.pending_request_id !== null;

            return (
              <div
                key={day.date}
                className={`rounded-2xl border shadow-sm p-4 transition-colors ${
                  hasIssue && !isPending
                    ? 'border-amber-300 bg-amber-50/40'
                    : day.is_future
                      ? 'bg-white border-slate-200 opacity-60'
                      : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>{formatDayLabel(day.date)}</span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {day.weekday.slice(0, 3)}
                      </span>
                      {day.is_today && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Today
                        </span>
                      )}
                      {att && <StatusBadge status={att.status} type={att.attendance_type} />}
                    </div>

                    {att ? (
                      <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <LogIn className="w-3 h-3 text-emerald-600" />
                          In: <strong className="text-slate-700">{att.check_in_display || '--'}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <LogOut className="w-3 h-3 text-rose-500" />
                          Out:{' '}
                          <strong className={att.check_out_display ? 'text-slate-700' : 'text-amber-600'}>
                            {att.check_out_display || 'Missing'}
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        {day.is_future ? (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Hourglass className="w-3 h-3" /> Upcoming working day
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-rose-600 font-semibold">
                            <AlertCircle className="w-3 h-3" /> No attendance recorded
                          </span>
                        )}
                      </div>
                    )}

                    {att?.check_in_address && (
                      <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap pt-0.5">
                        <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{att.check_in_address}</span>
                        {att.check_in_latitude != null && att.check_in_longitude != null && (
                          <a
                            href={`https://www.google.com/maps?q=${att.check_in_latitude},${att.check_in_longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            (Map)
                          </a>
                        )}
                      </div>
                    )}

                    {att?.admin_remarks && (
                      <div className="text-[11px] text-slate-400 italic">Note: {att.admin_remarks}</div>
                    )}
                  </div>

                  {att && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Duration
                      </div>
                      <div className="text-base font-extrabold text-slate-800 font-mono flex items-center gap-1 justify-end">
                        <Clock3 className="w-3.5 h-3.5 text-slate-400" />
                        {att.working_duration_display || '--'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual correction actions - only on days that actually need one */}
                {hasIssue && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80">
                    {isPending ? (
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <Hourglass className="w-3.5 h-3.5 shrink-0" />
                        {day.pending_request_type === 'MISSED_CHECK_OUT'
                          ? 'Manual check-out requested'
                          : 'Manual check-in requested'}
                        {' '}- awaiting admin review
                      </div>
                    ) : day.can_request_check_in ? (
                      <Link
                        to={`/assistant/requests?date=${day.date}&type=MISSED_CHECK_IN`}
                        className="flex items-center justify-center gap-2 w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black uppercase tracking-wide shadow-sm transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        Request Missed Check-In
                      </Link>
                    ) : day.can_request_check_out ? (
                      <Link
                        to={`/assistant/requests?date=${day.date}&type=MISSED_CHECK_OUT`}
                        className="flex items-center justify-center gap-2 w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wide shadow-sm transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Request Manual Check-Out
                      </Link>
                    ) : null}
                  </div>
                )}

                {att && day.issue === null && !isPending && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Duty day complete
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
