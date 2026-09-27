import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { MyCalendarResponse, CalendarDay, DaySchedule } from '../../types';
import {
  Calendar, ChevronLeft, ChevronRight, AlertCircle,
  FileQuestion, LogIn, LogOut, Hourglass, MapPin
} from 'lucide-react';
import { Link } from 'react-router-dom';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Renders an ISO date as the register's Calendar Day, e.g. 01-Sep-2026. */
const formatCalendarDay = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const month = MONTH_NAMES[m - 1].slice(0, 3);
  return `${String(d).padStart(2, '0')}-${month}-${y}`;
};

/** Colour-codes the Schedule column chip by duty type. */
const SCHEDULE_STYLES: Record<DaySchedule['code'], string> = {
  G: 'bg-sky-50 text-sky-700 border-sky-200',
  WH: 'bg-violet-50 text-violet-700 border-violet-200',
  X: 'bg-slate-100 text-slate-500 border-slate-200',
  PH: 'bg-amber-50 text-amber-700 border-amber-200',
  LV: 'bg-teal-50 text-teal-700 border-teal-200',
};

const codeChip = (schedule: DaySchedule): React.ReactNode => {
  const style = SCHEDULE_STYLES[schedule.code] ?? SCHEDULE_STYLES.X;
  return (
    <span className={`inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${style}`}>
      {schedule.code}
    </span>
  );
};

/** Renders a row's manual correction action, or null when none is warranted. */
const ActionCell: React.FC<{ day: CalendarDay }> = ({ day }) => {
  if (day.pending_request_id !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
        <Hourglass className="w-3 h-3 shrink-0" />
        {day.pending_request_type === 'MISSED_CHECK_OUT' ? 'Out pending' : 'In pending'}
      </span>
    );
  }
  if (day.can_request_check_in) {
    return (
      <Link
        to={`/assistant/requests?date=${day.date}&type=MISSED_CHECK_IN`}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-2 py-1.5 min-h-[32px] transition-colors"
      >
        <LogIn className="w-3 h-3" />
        Request In
      </Link>
    );
  }
  if (day.can_request_check_out) {
    return (
      <Link
        to={`/assistant/requests?date=${day.date}&type=MISSED_CHECK_OUT`}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-2 py-1.5 min-h-[32px] transition-colors"
      >
        <LogOut className="w-3 h-3" />
        Request Out
      </Link>
    );
  }
  return <span className="text-slate-300 text-xs">&mdash;</span>;
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
      // The server owns the schedule, the working calendar and the lateness
      // verdicts, so the client renders them without re-deriving anything.
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
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Attendance History</h1>
          <p className="text-xs text-slate-500">Your monthly attendance register</p>
        </div>
        <Link
          to="/assistant"
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
        >
          &larr; Back to Today
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
          <span>{MONTH_NAMES[month - 1]} {year}</span>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
            <div className="text-lg font-black text-slate-800 font-mono">{data.summary.working_days}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Working Days</div>
          </div>
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
          <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
            <div className="text-lg font-black text-slate-800 font-mono">{data.summary.weekly_off_days}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Weekly Offs</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : !data || data.days.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
          No records found for {MONTH_NAMES[month - 1]} {year}.
        </div>
      ) : (
        <>
          {/* Desktop register: horizontally scrollable so all nine columns fit. */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Calendar Day', 'Day', 'Schedule', 'Check-IN Time', 'Check-OUT Time', 'Duration', 'IN', 'OUT', 'Remarks', 'Action'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day: CalendarDay) => {
                    const att = day.attendance;
                    const rowTone = day.pending_request_id !== null || day.issue
                      ? 'bg-amber-50/50'
                      : day.is_future
                        ? 'bg-slate-50/60'
                        : 'bg-white';
                    return (
                      <tr key={day.date} className={`${rowTone} border-b border-slate-100 last:border-0 hover:bg-slate-50`}>
                        <td className="px-3 py-2.5 text-xs font-bold text-slate-800 font-mono whitespace-nowrap">
                          {formatCalendarDay(day.date)}
                          {day.is_today && (
                            <span className="ml-1.5 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
                              Today
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                          {day.weekday_short}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {codeChip(day.schedule)}
                            <span className="text-slate-500">{day.schedule.short_label}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-700 whitespace-nowrap">
                          {att?.check_in_display ?? <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">
                          {att?.check_out_display
                            ? <span className="text-slate-700">{att.check_out_display}</span>
                            : att
                              ? <span className="text-amber-600 font-bold">Missing</span>
                              : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-bold text-slate-800 whitespace-nowrap">
                          {att?.working_duration_display && att.working_duration_display !== '--'
                            ? att.working_duration_display
                            : <span className="text-slate-300 font-normal">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {att?.in_status === 0
                            ? <span className="text-emerald-600 font-black font-mono text-xs">0</span>
                            : att?.in_status === -1
                              ? <span className="text-rose-600 font-black font-mono text-xs">-1</span>
                              : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {att?.out_offset_minutes != null ? (
                            <span className={`font-mono text-xs font-bold ${att.out_offset_minutes < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {att.out_offset_minutes > 0 ? '+' : ''}{att.out_offset_minutes}
                            </span>
                          ) : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-500 max-w-[200px]">
                          {day.remarks || <span className="text-slate-300">&mdash;</span>}
                          {att?.check_in_address && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                              <span className="truncate">{att.check_in_address}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <ActionCell day={day} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile register: the same columns stacked per day. */}
          <div className="lg:hidden space-y-2">
            {data.days.map((day: CalendarDay) => {
              const att = day.attendance;
              return (
                <div
                  key={day.date}
                  className={`bg-white rounded-xl border p-3 shadow-sm ${
                    day.issue ? 'border-amber-300' : 'border-slate-200'
                  } ${day.is_future ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-black font-mono text-slate-800">{formatCalendarDay(day.date)}</span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">{day.weekday_short}</span>
                      {day.is_today && (
                        <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">Today</span>
                      )}
                    </div>
                    {codeChip(day.schedule)}
                  </div>

                  <div className="text-[11px] text-slate-500 mb-2">{day.schedule.label}</div>

                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div>
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">IN</div>
                      <div className="text-[11px] font-mono font-bold text-slate-700">{att?.check_in_display ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">OUT</div>
                      <div className={`text-[11px] font-mono font-bold ${att && !att.check_out_display ? 'text-amber-600' : 'text-slate-700'}`}>
                        {att?.check_out_display ?? (att ? 'Missing' : '—')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">Duration</div>
                      <div className="text-[11px] font-mono font-bold text-slate-800">
                        {att?.working_duration_display && att.working_duration_display !== '--' ? att.working_duration_display : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">In/Out</div>
                      <div className="text-[11px] font-mono font-bold">
                        <span className={att?.in_status === -1 ? 'text-rose-600' : 'text-emerald-600'}>
                          {att?.in_status ?? '—'}
                        </span>
                        <span className="text-slate-300"> / </span>
                        <span className={(att?.out_offset_minutes ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {att?.out_offset_minutes != null
                            ? `${att.out_offset_minutes > 0 ? '+' : ''}${att.out_offset_minutes}`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {day.remarks && (
                    <div className="text-[10px] text-slate-400 italic mt-2 flex items-start gap-1">
                      <FileQuestion className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                      <span>{day.remarks}</span>
                    </div>
                  )}

                  {(day.issue || day.pending_request_id !== null) && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <ActionCell day={day} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
