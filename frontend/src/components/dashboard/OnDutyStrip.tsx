import React from 'react';
import { Radio, UserCheck } from 'lucide-react';
import type { DailyReportRecord } from '../../types';

interface OnDutyStripProps {
  records: DailyReportRecord[];
  onShowOnDuty: () => void;
}

const MAX_AVATARS = 6;

/**
 * A single-row live snapshot of who is on duty. Deliberately compact: the
 * roster table below is the single source for per-assistant detail (GPS,
 * addresses, reset actions), so this strip only answers "how many, who".
 */
export const OnDutyStrip: React.FC<OnDutyStripProps> = ({ records, onShowOnDuty }) => {
  const count = records.length;
  const preview = records.slice(0, MAX_AVATARS);
  const overflow = count - preview.length;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

      <div className="flex items-center gap-4 relative z-10 min-w-0">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-emerald-400">{count}</span>
            <span className="text-sm font-black text-white">On Duty</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {count === 0
              ? 'No field assistants are currently clocked in.'
              : 'Assistants clocked in and active in the field right now.'}
          </p>
        </div>

        {preview.length > 0 && (
          <div className="hidden md:flex items-center pl-2">
            {preview.map((r, i) => (
              <div
                key={r.employee_id}
                title={r.employee_name}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xs font-black border-2 border-slate-800 -ml-2 first:ml-0"
                style={{ zIndex: preview.length - i }}
              >
                {r.employee_name.charAt(0).toUpperCase()}
              </div>
            ))}
            {overflow > 0 && (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-black border-2 border-slate-800 -ml-2">
                +{overflow}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onShowOnDuty}
        className="relative z-10 inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black shadow-md transition-all cursor-pointer shrink-0"
      >
        {count === 0 ? (
          <UserCheck className="w-3.5 h-3.5 text-slate-950" />
        ) : (
          <Radio className="w-3.5 h-3.5 text-slate-950" />
        )}
        <span>On-Duty Roster</span>
      </button>
    </div>
  );
};
