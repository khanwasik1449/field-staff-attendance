import React from 'react';
import { Link } from 'react-router-dom';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import {
  Filter,
  X,
  Briefcase,
  MapPin,
  RotateCcw,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import { isOnDuty } from '../../lib/attendance';
import type { DailyReportRecord, EmployeeType } from '../../types';

export type RosterStatusTab = 'ALL' | 'ON_DUTY' | 'COMPLETED' | 'ABSENT';

interface AttendanceRosterProps {
  records: DailyReportRecord[];
  statusTab: RosterStatusTab;
  onStatusTabChange: (tab: RosterStatusTab) => void;
  employeeTypeFilter: EmployeeType | null;
  onEmployeeTypeChange: (type: EmployeeType | null) => void;
  onResetDuty: (employeeId?: string, employeeName?: string, isAll?: boolean) => void;
  onResetPassword: (employeeId: string) => void;
}

const TAB_LABELS: Record<Exclude<RosterStatusTab, 'ALL'>, string> = {
  ON_DUTY: 'On Duty',
  COMPLETED: 'Finished Shift',
  ABSENT: 'Absent',
};

const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  FIELD_STAFF: 'Field Staff',
  INTERN: 'Intern',
};

/**
 * The single authoritative per-assistant table. Holds the status tabs, the
 * employee-type scope selector (server-side filtering) and the row actions, so
 * every other dashboard surface can stay a summary.
 */
export const AttendanceRoster: React.FC<AttendanceRosterProps> = ({
  records,
  statusTab,
  onStatusTabChange,
  employeeTypeFilter,
  onEmployeeTypeChange,
  onResetDuty,
  onResetPassword,
}) => {
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const tabCounts = {
    all: records.length,
    on_duty: records.filter(isOnDuty).length,
    completed: records.filter((r) => r.check_out && r.check_out !== '--').length,
    absent: records.filter((r) => r.status === 'ABSENT').length,
  };

  let displayedRecords = records;
  if (statusTab === 'ON_DUTY') {
    displayedRecords = records.filter(isOnDuty);
  } else if (statusTab === 'COMPLETED') {
    displayedRecords = records.filter((r) => r.check_out && r.check_out !== '--');
  } else if (statusTab === 'ABSENT') {
    displayedRecords = records.filter((r) => r.status === 'ABSENT');
  }

  const hasActiveFilter = Boolean(employeeTypeFilter) || statusTab !== 'ALL';

  return (
    <div id="attendance-roster-section" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Today's Attendance Roster</span>
            <span className="text-xs text-slate-400 font-normal">
              ({displayedRecords.length} {employeeTypeFilter ? `in ${EMPLOYEE_TYPE_LABELS[employeeTypeFilter]}` : 'shown'})
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative real-time attendance timestamps and genuine GPS punch locations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Employee type scope (server-side) */}
          <select
            value={employeeTypeFilter ?? ''}
            onChange={(e) => onEmployeeTypeChange((e.target.value as EmployeeType) || null)}
            className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            title="Filter the roster and KPIs by employee type"
          >
            <option value="">All Employee Types</option>
            {activeEmployeeTypes.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>

          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => onStatusTabChange('ALL')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({tabCounts.all})
            </button>
            <button
              type="button"
              onClick={() => onStatusTabChange('ON_DUTY')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                statusTab === 'ON_DUTY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>On Duty ({tabCounts.on_duty})</span>
            </button>
            <button
              type="button"
              onClick={() => onStatusTabChange('COMPLETED')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'COMPLETED' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Finished ({tabCounts.completed})
            </button>
            <button
              type="button"
              onClick={() => onStatusTabChange('ABSENT')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'ABSENT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Absent ({tabCounts.absent})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onResetDuty(undefined, 'All Field Assistants', true)}
            className="text-xs font-bold text-rose-700 hover:text-rose-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-2xs"
            title="Reset today's attendance sessions for all field assistants"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>Reset All Today</span>
          </button>

          <Link
            to="/admin/daily"
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all"
          >
            Export <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {hasActiveFilter && (
        <div className="px-6 py-2.5 bg-emerald-50/70 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-emerald-950 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              <span>Active Filters:</span>
            </span>

            {employeeTypeFilter && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-slate-800 border border-emerald-300 font-bold shadow-2xs">
                <Briefcase className="w-3 h-3 text-blue-600" />
                <span>Employee Type: {EMPLOYEE_TYPE_LABELS[employeeTypeFilter]}</span>
                <button
                  type="button"
                  onClick={() => onEmployeeTypeChange(null)}
                  className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer"
                  title="Clear employee type filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusTab !== 'ALL' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-slate-800 border border-emerald-300 font-bold shadow-2xs">
                <span>Status: {TAB_LABELS[statusTab]}</span>
                <button
                  type="button"
                  onClick={() => onStatusTabChange('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer"
                  title="Clear status filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <span className="text-slate-500 font-medium">
              (Showing {displayedRecords.length} of {records.length} assistants)
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onEmployeeTypeChange(null);
              onStatusTabChange('ALL');
            }}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
          >
            <span>Reset all filters</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
            <tr>
              <th className="py-3.5 px-6">Field Assistant</th>
              <th className="py-3.5 px-6">Employee Type</th>
              <th className="py-3.5 px-6">Check In & Real-Time Location</th>
              <th className="py-3.5 px-6">Check Out & Real-Time Location</th>
              <th className="py-3.5 px-6">Working Hours</th>
              <th className="py-3.5 px-6">Status</th>
              <th className="py-3.5 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {displayedRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  No field assistants found matching this filter.
                </td>
              </tr>
            ) : (
              displayedRecords.map((r) => {
                const onDuty = isOnDuty(r);
                return (
                  <tr
                    key={r.employee_id}
                    className={`hover:bg-slate-50/80 transition-colors ${onDuty ? 'bg-emerald-50/30' : ''}`}
                  >
                    <td className="py-3.5 px-6 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        {onDuty && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
                        <div>
                          <div className="font-bold text-slate-900">{r.employee_name}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            {r.employee_id} • {r.department}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
                        <Briefcase className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {r.employee_type_display || EMPLOYEE_TYPE_LABELS[r.employee_type] || r.employee_type}
                        </span>
                      </span>
                    </td>

                    <td className="py-3.5 px-6">
                      {r.check_in !== '--' ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-slate-900 text-xs">{r.check_in}</div>
                          {r.check_in_address ? (
                            <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate max-w-xs">{r.check_in_address}</span>
                            </div>
                          ) : r.check_in_latitude ? (
                            <div className="text-[10px] text-slate-400 font-mono">
                              GPS: {r.check_in_latitude}, {r.check_in_longitude}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">--</span>
                      )}
                    </td>

                    <td className="py-3.5 px-6">
                      {r.check_out !== '--' ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-slate-900 text-xs">{r.check_out}</div>
                          {r.check_out_address ? (
                            <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                              <span className="truncate max-w-xs">{r.check_out_address}</span>
                            </div>
                          ) : r.check_out_latitude ? (
                            <div className="text-[10px] text-slate-400 font-mono">
                              GPS: {r.check_out_latitude}, {r.check_out_longitude}
                            </div>
                          ) : null}
                        </div>
                      ) : onDuty ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          In Progress (On Duty)
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">--</span>
                      )}
                    </td>

                    <td className="py-3.5 px-6 font-mono font-bold text-slate-800 text-xs">{r.duration}</td>

                    <td className="py-3.5 px-6">
                      {onDuty ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          On Duty
                        </span>
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onResetDuty(r.employee_id, r.employee_name, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold transition-all border border-slate-200 hover:border-rose-300 cursor-pointer"
                          title={`Reset today's duty for ${r.employee_name}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                          <span>Reset Duty</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onResetPassword(r.employee_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-xs font-bold transition-all border border-slate-200 hover:border-amber-300 cursor-pointer"
                          title={`Reset password for ${r.employee_name}`}
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                          <span>Password</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
