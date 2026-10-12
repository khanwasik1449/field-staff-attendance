import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { AuditLog } from '../../types';
import {
  Shield,
  Search,
  Filter,
  Calendar,
  Clock,
  Eye,
  CheckCircle2,
  FileCode
} from 'lucide-react';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/audit-logs/', {
        params: {
          action: actionFilter || undefined,
        }
      });
      setLogs(res.data.results || res.data);
    } catch (err) {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter]);

  const actionOptions = [
    'CHECK_IN',
    'CHECK_OUT',
    'MANUAL_REQUEST_CREATED',
    'MANUAL_REQUEST_APPROVED',
    'MANUAL_REQUEST_REJECTED',
    'ATTENDANCE_APPROVED',
    'ATTENDANCE_REJECTED',
    'ATTENDANCE_VOIDED',
    'ATTENDANCE_BULK_APPROVED',
    'LEAVE_REQUEST_SUBMITTED',
    'LEAVE_REQUEST_APPROVED',
    'LEAVE_REQUEST_REJECTED',
    'HOLIDAY_CREATED',
    'HOLIDAY_DELETED',
    'SCHEDULE_UPDATE',
    'SCHEDULE_RESET',
    'USER_LOGIN',
    'USER_CREATED',
    'USER_DISABLED',
    'USER_ACTIVATED',
    'USER_UPDATED',
    'SETTING_UPDATED',
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          System Audit Trail
        </h1>
        <p className="text-xs text-slate-500">
          Immutable ledger of attendance actions, manual request reviews, and security transitions
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Filter Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Actions</option>
            {actionOptions.map((act) => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {logs.length} audit entries
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No audit log entries recorded for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Timestamp (Dhaka)</th>
                  <th className="py-3.5 px-6">Actor</th>
                  <th className="py-3.5 px-6">Action</th>
                  <th className="py-3.5 px-6">Target Object</th>
                  <th className="py-3.5 px-6">IP / Agent</th>
                  <th className="py-3.5 px-6">Remarks</th>
                  <th className="py-3.5 px-6 text-right">State Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-xs text-slate-600">
                      {new Date(l.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="font-bold text-slate-900">{l.username}</span>
                      {l.role && <span className="text-xs text-slate-400 block font-mono">({l.role})</span>}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-xs text-slate-600">
                      {l.object_type} #{l.object_id}
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-500">
                      <div className="font-mono">{l.ip_address || '127.0.0.1'}</div>
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-600 max-w-xs truncate">
                      {l.remarks || '--'}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {(l.previous_state || l.new_state) ? (
                        <button
                          onClick={() => setSelectedLog(l)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Diff
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON State Diff Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-600" />
                Audit State Diff - {selectedLog.action}
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <h4 className="font-bold text-slate-600 uppercase tracking-wider mb-1">Previous State</h4>
                <pre className="p-3 bg-slate-50 rounded-xl border border-slate-200 overflow-x-auto font-mono text-[11px] text-slate-800 max-h-60">
                  {selectedLog.previous_state ? JSON.stringify(selectedLog.previous_state, null, 2) : 'null (None)'}
                </pre>
              </div>

              <div>
                <h4 className="font-bold text-slate-600 uppercase tracking-wider mb-1">New State</h4>
                <pre className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 overflow-x-auto font-mono text-[11px] text-emerald-950 max-h-60">
                  {selectedLog.new_state ? JSON.stringify(selectedLog.new_state, null, 2) : 'null (None)'}
                </pre>
              </div>
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
