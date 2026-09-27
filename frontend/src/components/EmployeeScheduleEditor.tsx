import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, extractErrorMessage } from '../lib/api';
import { ScheduleDay, EmployeeScheduleResponse } from '../types';
import { CalendarClock, RotateCcw, Save, Loader2 } from 'lucide-react';

interface Props {
  employeeId: number;
  /** Called after a successful save so the parent can surface a message. */
  onSaved?: (message: string) => void;
}

type DraftRow = {
  weekday: number;
  weekday_name: string;
  day_type: 'G' | 'WH' | 'X';
  start_time: string;
  end_time: string;
};

const DAY_TYPES: { value: DraftRow['day_type']; label: string }[] = [
  { value: 'G', label: 'G — General (Office)' },
  { value: 'WH', label: 'WH — Work from Home' },
  { value: 'X', label: 'X — Weekly Off' },
];

/** 'HH:MM AM' / 'HH:MM' -> 'HH:MM' for an <input type="time">. */
const toTimeInput = (value: string): string => {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
};

export const EmployeeScheduleEditor: React.FC<Props> = ({ employeeId, onSaved }) => {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<EmployeeScheduleResponse>(
        `/attendance/admin/employee-schedule/${employeeId}/`
      );
      setRows(
        res.data.days.map((d: ScheduleDay) => ({
          weekday: d.weekday,
          weekday_name: d.weekday_name,
          // PH/LV are derived from holidays and leave, never assignable here.
          day_type: d.code === 'WH' ? 'WH' : d.code === 'X' ? 'X' : 'G',
          start_time: toTimeInput(d.start_time),
          end_time: toTimeInput(d.end_time),
        }))
      );
      setDirty(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (weekday: number, changes: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...changes } : r)));
    setDirty(true);
  };

  const handleSave = async () => {
    // Validate locally so an obviously inverted shift never reaches the server.
    for (const row of rows) {
      if (row.day_type === 'X') continue;
      if (row.start_time && row.end_time && row.start_time > row.end_time) {
        setError(`${row.weekday_name}: start time must not be later than end time.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post('/attendance/admin/employee-schedule/', {
        employee_id: employeeId,
        days: rows,
      });
      const message = res.data?.detail ?? 'Schedule updated.';
      onSaved?.(message);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this schedule to the company working week?')) return;
    setResetting(true);
    setError(null);
    try {
      const res = await apiClient.delete(
        `/attendance/admin/employee-schedule/${employeeId}/`
      );
      onSaved?.(res.data?.detail ?? 'Schedule reset to company defaults.');
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <CalendarClock className="w-4 h-4 text-emerald-600" />
          Weekly Duty Schedule
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || saving}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 disabled:opacity-40"
        >
          <RotateCcw className="w-3 h-3" />
          {resetting ? 'Resetting...' : 'Reset to defaults'}
        </button>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Drives the Schedule column in the assistant&apos;s Attendance History and decides
        which days they owe attendance. Days left untouched fall back to the company
        working week. Public holidays and approved leave always override this pattern.
      </p>

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[11px]">
          {error}
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.weekday} className="grid grid-cols-[1fr_auto] gap-2 p-2.5 bg-white">
            <div className="min-w-0 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700">{row.weekday_name}</div>
              <select
                value={row.day_type}
                onChange={(e) => patch(row.weekday, { day_type: e.target.value as DraftRow['day_type'] })}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {DAY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {row.day_type !== 'X' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={row.start_time}
                    onChange={(e) => patch(row.weekday, { start_time: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">to</span>
                  <input
                    type="time"
                    value={row.end_time}
                    onChange={(e) => patch(row.weekday, { end_time: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
            <div className="flex items-start">
              <span
                className={`text-[10px] font-black uppercase px-1.5 py-1 rounded border ${
                  row.day_type === 'G'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : row.day_type === 'WH'
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {row.day_type}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold shadow-sm transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>
    </div>
  );
};
