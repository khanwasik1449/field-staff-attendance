import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import type { DashboardSummary, DailyReportResponse, EmployeeType, Employee } from '../../types';
import { isOnDuty } from '../../lib/attendance';
import { StatsOverview } from '../../components/dashboard/StatsOverview';
import { OnDutyStrip } from '../../components/dashboard/OnDutyStrip';
import { AttendanceRoster, type RosterStatusTab } from '../../components/dashboard/AttendanceRoster';
import { PasswordResetModal } from '../../components/dashboard/PasswordResetModal';
import { ResetDutyModal, type ResetDutyTarget } from '../../components/dashboard/ResetDutyModal';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  RefreshCw,
  UploadCloud,
  UserPlus,
  X,
  ShieldCheck,
  FileQuestion,
  CalendarDays,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<EmployeeType | null>(null);
  const [rosterData, setRosterData] = useState<DailyReportResponse | null>(null);
  const [statusTab, setStatusTab] = useState<RosterStatusTab>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [passwordResetEmpId, setPasswordResetEmpId] = useState<string>('');

  // Reset duty confirmation modal
  const [resetDutyTarget, setResetDutyTarget] = useState<ResetDutyTarget | null>(null);
  const [dutyNotification, setDutyNotification] = useState<string | null>(null);

  const fetchMeta = useCallback(async () => {
    const [empRes] = await Promise.all([
      apiClient.get('/auth/employees/'),
    ]);
    setEmployees(empRes.data.results || empRes.data || []);
  }, []);

  // The daily report is the single source for both the KPI snapshot and the
  // roster rows, scoped server-side so the counters can never disagree with the
  // assistants listed underneath them.
  const refreshRoster = useCallback(async () => {
    const res = await apiClient.get<DailyReportResponse>('/admin/reports/daily/', {
      params: { employee_type: employeeTypeFilter ?? undefined },
    });
    setRosterData(res.data);
    setSummary(res.data.summary);
  }, [employeeTypeFilter]);

  useEffect(() => {
    fetchMeta().catch((err) => setError(extractErrorMessage(err)));
  }, [fetchMeta]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DailyReportResponse>('/admin/reports/daily/', {
        params: { employee_type: employeeTypeFilter ?? undefined },
      })
      .then((res) => {
        if (cancelled) return;
        setRosterData(res.data);
        setSummary(res.data.summary);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeTypeFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchMeta(), refreshRoster()]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const onDutyRecords = useMemo(
    () => (rosterData?.records || []).filter(isOnDuty),
    [rosterData]
  );

  const handleShowOnDuty = () => {
    setStatusTab('ON_DUTY');
    const el = document.getElementById('attendance-roster-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleOpenResetModal = (empId?: string) => {
    setPasswordResetEmpId(empId || '');
    setShowResetModal(true);
  };

  const handleOpenResetDutyModal = (employeeId?: string, employeeName?: string, isAll?: boolean) => {
    setResetDutyTarget({
      isOpen: true,
      employeeId,
      employeeName: employeeName || (isAll ? 'All Field Assistants' : 'Field Assistant'),
      isAll: Boolean(isAll),
    });
  };

  const handleDutyConfirmed = async (detail: string) => {
    setResetDutyTarget(null);
    setDutyNotification(detail);
    setTimeout(() => setDutyNotification(null), 5000);
    try {
      await refreshRoster();
    } catch {
      /* keep the success toast; a stale roster will refresh on next action */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Field Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative employee type-based attendance & real-time check-in/out tracking • Date:{' '}
            <strong className="text-slate-800">{summary?.date}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/admin/daily"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Full Daily Report</span>
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 pl-1 pr-1">
          Quick Actions:
        </span>
        <Link
          to="/admin/employees?action=add-assistant"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
          title="Register a new Field Assistant account"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Assistant</span>
        </Link>
        <Link
          to="/admin/employees?action=bulk-upload"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
          title="Bulk import Field Assistants from Excel or CSV"
        >
          <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
          <span>Bulk Upload FAs</span>
        </Link>
        <button
          type="button"
          onClick={() => handleOpenResetModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
          title="Generate a temporary password for any Field Assistant"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Reset FA Password</span>
        </button>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-500 shadow-2xs">
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span>Approvals</span>
        </span>
        <Link
          to="/admin/attendance-approvals"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-800 shadow-2xs transition-all"
          title="Approve or reject daily attendance (duty day sign-off)"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Daily Attendance</span>
        </Link>
        <Link
          to="/admin/manual-requests"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-bold text-amber-800 shadow-2xs transition-all"
          title="Review manual punch / correction requests"
        >
          <FileQuestion className="w-3.5 h-3.5 text-amber-600" />
          <span>Manual Attendance</span>
        </Link>
        <Link
          to="/admin/leaves"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 text-xs font-bold text-violet-800 shadow-2xs transition-all"
          title="Approve or reject leave applications and manage holidays"
        >
          <CalendarDays className="w-3.5 h-3.5 text-violet-600" />
          <span>Leave</span>
        </Link>
      </div>

      {dutyNotification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{dutyNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setDutyNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
          {error}
        </div>
      )}

      <StatsOverview
        summary={summary}
        totalAssistants={employees.length}
        onDutyCount={onDutyRecords.length}
        onShowOnDuty={handleShowOnDuty}
      />

      <OnDutyStrip records={onDutyRecords} onShowOnDuty={handleShowOnDuty} />

      <AttendanceRoster
        records={rosterData?.records || []}
        statusTab={statusTab}
        onStatusTabChange={setStatusTab}
        employeeTypeFilter={employeeTypeFilter}
        onEmployeeTypeChange={setEmployeeTypeFilter}
        onResetDuty={handleOpenResetDutyModal}
        onResetPassword={handleOpenResetModal}
      />

      <PasswordResetModal
        open={showResetModal}
        initialEmployeeId={passwordResetEmpId}
        employees={employees}
        onClose={() => setShowResetModal(false)}
      />

      <ResetDutyModal
        target={resetDutyTarget}
        onClose={() => setResetDutyTarget(null)}
        onConfirmed={handleDutyConfirmed}
      />
    </div>
  );
};
