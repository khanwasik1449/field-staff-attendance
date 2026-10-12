import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { Attendance, AttendanceApprovalStatus } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  CheckCircle2, XCircle, Hourglass, Search, CalendarCheck,
  Users, Ban, ShieldCheck, X, Briefcase
} from 'lucide-react';

/**
 * Admin queue for the mandatory daily attendance sign-off.
 *
 * Every duty day lands here as PENDING after a mobile punch. Only APPROVED rows
 * count toward reports and payroll, so this screen is the gate between a field
 * punch and the payroll register.
 */

type Tab = AttendanceApprovalStatus;

const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED'];

const TAB_META: Record<Tab, { label: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', icon: Hourglass },
  APPROVED: { label: 'Approved', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', icon: XCircle },
};

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

export const AdminAttendanceApprovals: React.FC = () => {
  const [rows, setRows] = useState<Attendance[]>([]);
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState<string>('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Review modal state. `mode` doubles as the submit label.
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  // Void is destructive and irreversible, so it asks separately.
  const [voidTarget, setVoidTarget] = useState<Attendance | null>(null);
  const [voidRemarks, setVoidRemarks] = useState('');

  const [bulkTarget, setBulkTarget] = useState<string | null>(null);
  const [bulkRemarks, setBulkRemarks] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/admin/all/', {
        params: {
          approval_status: activeTab,
          date: filterDate || undefined,
          search: search || undefined,
          employee_type: employeeTypeFilter || undefined,
          page,
        },
      });
      const data = res.data;
      setRows(Array.isArray(data) ? data : (data.results ?? []));
      if (!Array.isArray(data)) setTotalPages(data.count ? Math.ceil(data.count / 25) : 1);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterDate, search, employeeTypeFilter, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Any tab/date/search change should return to the first page.
  const handleTabChange = (tab: Tab) => { setActiveTab(tab); setPage(1); };
  const handleDateChange = (value: string) => { setFilterDate(value); setPage(1); };
  const handleSearchChange = (value: string) => { setSearch(value); setPage(1); };

  const openReview = (row: Attendance, nextMode: 'approve' | 'reject') => {
    setSelected(row);
    setMode(nextMode);
    setRemarks(nextMode === 'approve' ? 'Approved after supervisor verification.' : '');
    setFeedback(null);
  };

  const closeReview = () => { setSelected(null); setMode(null); setRemarks(''); };

  const handleConfirmReview = async () => {
    if (!selected || !mode) return;
    setProcessing(true);
    try {
      const res = await apiClient.post(
        `/attendance/admin/all/${selected.id}/${mode}/`,
        { admin_remarks: remarks }
      );
      setFeedback({ type: 'success', message: res.data.detail });
      closeReview();
      await fetchRows();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    setProcessing(true);
    try {
      const res = await apiClient.post(
        `/attendance/admin/all/${voidTarget.id}/void/`,
        { admin_remarks: voidRemarks }
      );
      setFeedback({ type: 'success', message: res.data.detail });
      setVoidTarget(null);
      setVoidRemarks('');
      await fetchRows();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!bulkTarget) return;
    setProcessing(true);
    try {
      const res = await apiClient.post('/attendance/admin/all/bulk-approve/', {
        date: bulkTarget,
        admin_remarks: bulkRemarks,
      });
      setFeedback({ type: 'success', message: res.data.detail });
      setBulkTarget(null);
      setBulkRemarks('');
      await fetchRows();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Attendance Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Every duty day needs admin sign-off before it counts toward payroll.
          </p>
        </div>
        {activeTab === 'PENDING' && filterDate && (
          <button
            onClick={() => { setBulkTarget(filterDate); setBulkRemarks('End of shift review.'); }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all inline-flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Approve all pending for {filterDate}
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          <span className="text-sm font-medium">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map((tab) => {
            const Icon = TAB_META[tab].icon;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex-1 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2 ${
                  isActive
                    ? 'border-b-2 border-emerald-600 text-emerald-700 bg-emerald-50/40'
                    : 'text-slate-500 hover:bg-slate-50 border-b-2 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {TAB_META[tab].label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Duty date
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Employee Type
            </label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={employeeTypeFilter}
                onChange={(e) => { setEmployeeTypeFilter(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">All employee types</option>
                {activeEmployeeTypes.map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Search assistant
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="ID, name or username"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="m-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading attendance...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-semibold">
              No {TAB_META[activeTab].label.toLowerCase()} attendance for this date.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Assistant</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">In</th>
                  <th className="py-3.5 px-6">Out</th>
                  <th className="py-3.5 px-6">Duration</th>
                  <th className="py-3.5 px-6">Type</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-800">{row.employee_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{row.employee_id}</div>
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-600 font-mono whitespace-nowrap">
                      {row.attendance_date}
                    </td>
                    <td className="py-3.5 px-6 text-xs font-mono text-slate-700">
                      {row.check_in_display}
                    </td>
                    <td className="py-3.5 px-6 text-xs font-mono text-slate-700">
                      {row.check_out_display ?? <span className="text-amber-600 font-bold">Missing</span>}
                    </td>
                    <td className="py-3.5 px-6 text-xs font-mono font-semibold text-slate-800">
                      {row.working_duration_display}
                    </td>
                    <td className="py-3.5 px-6">
                      <StatusBadge status={row.attendance_type} type={row.attendance_type} />
                    </td>
                    <td className="py-3.5 px-6">
                      <StatusBadge status={row.status} type={row.attendance_type} />
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex items-center justify-end gap-2">
                        {row.approval_status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => openReview(row, 'approve')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openReview(row, 'reject')}
                              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {row.approval_status === 'REJECTED' && (
                          <>
                            <span className="text-xs text-slate-400">
                              {row.approved_by_username ? `By ${row.approved_by_username}` : 'Rejected'}
                            </span>
                            <button
                              onClick={() => { setVoidTarget(row); setVoidRemarks(''); }}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold transition-all inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Void
                            </button>
                          </>
                        )}
                        {row.approval_status === 'APPROVED' && (
                          <span className="text-xs text-slate-400">
                            {row.approved_by_username ? `By ${row.approved_by_username}` : 'Approved'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Per-row review modal */}
      {selected && mode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">
              {mode === 'approve' ? 'Approve Attendance' : 'Reject Attendance'}
            </h2>
            <div className="mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div><span className="text-slate-400">Assistant</span> <b>{selected.employee_name} ({selected.employee_id})</b></div>
              <div><span className="text-slate-400">Date</span> <b>{selected.attendance_date}</b></div>
              <div>
                <span className="text-slate-400">Times</span>{' '}
                <b>{selected.check_in_display} &rarr; {selected.check_out_display ?? 'no check-out'}</b>
              </div>
              <div><span className="text-slate-400">Duration</span> <b>{selected.working_duration_display}</b></div>
            </div>
            {mode === 'reject' && (
              <p className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                Rejecting keeps the record as evidence but excludes it from payroll.
                The date cannot be re-punched until an admin voids it.
              </p>
            )}
            <label className="block mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              {mode === 'reject' ? 'Reason (required)' : 'Remarks'}
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Enter remarks for audit trail..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={closeReview}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReview}
                disabled={processing || (mode === 'reject' && !remarks.trim())}
                className={`px-4 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 transition-all ${
                  mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {processing ? 'Working...' : mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void confirmation */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Void Rejected Attendance</h2>
            <p className="mt-3 text-sm text-slate-600">
              This permanently deletes the record for{' '}
              <b>{voidTarget.employee_name}</b> on <b>{voidTarget.attendance_date}</b> and frees
              the date so it can be punched again.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              The punch times and the reason for rejection are preserved in the audit log.
            </p>
            <label className="block mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Remarks
            </label>
            <textarea
              value={voidRemarks}
              onChange={(e) => setVoidRemarks(e.target.value)}
              rows={2}
              placeholder="Why is this being voided?"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setVoidTarget(null); setVoidRemarks(''); }}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 transition-all"
              >
                {processing ? 'Working...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk approve confirmation */}
      {bulkTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Approve all pending days
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Approves every attendance record still marked <b>Pending</b> on{' '}
              <b>{bulkTarget}</b> that matches the current filters.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Only pending records are affected. Approved and rejected records are left untouched.
            </p>
            <label className="block mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Remarks
            </label>
            <textarea
              value={bulkRemarks}
              onChange={(e) => setBulkRemarks(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setBulkTarget(null)}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkApprove}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 transition-all"
              >
                {processing ? 'Working...' : 'Approve All Pending'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
