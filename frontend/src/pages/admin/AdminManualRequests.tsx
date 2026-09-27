import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { ManualAttendanceRequest } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  FileQuestion,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertCircle,
  MessageSquare,
  Filter
} from 'lucide-react';

export const AdminManualRequests: React.FC = () => {
  const [requests, setRequests] = useState<ManualAttendanceRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Review modal state
  const [selectedReq, setSelectedReq] = useState<ManualAttendanceRequest | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/manual-requests/admin/', {
        params: { status: activeTab }
      });
      setRequests(res.data.results || res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [activeTab]);

  const openReviewModal = (req: ManualAttendanceRequest, action: 'approve' | 'reject') => {
    setSelectedReq(req);
    setModalAction(action);
    setAdminRemarks(action === 'approve' ? 'Approved after supervisor verification.' : '');
  };

  const closeReviewModal = () => {
    setSelectedReq(null);
    setModalAction(null);
    setAdminRemarks('');
  };

  const handleConfirmReview = async () => {
    if (!selectedReq || !modalAction) return;
    setProcessing(true);
    try {
      const endpoint = `/manual-requests/admin/${selectedReq.id}/${modalAction}/`;
      const res = await apiClient.post(endpoint, { admin_remarks: adminRemarks });
      setActionSuccess(res.data.detail);
      closeReviewModal();
      await fetchRequests();
    } catch (err) {
      alert('Action failed: ' + extractErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Manual Attendance Requests
        </h1>
        <p className="text-xs text-slate-500">
          Review, approve, or reject field assistant exception requests
        </p>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setActionSuccess(null);
            }}
            className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'PENDING' && 'Pending Review'}
            {tab === 'APPROVED' && 'Approved Requests'}
            {tab === 'REJECTED' && 'Rejected Requests'}
          </button>
        ))}
      </div>

      {/* List / Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No {activeTab.toLowerCase()} manual attendance requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Assistant</th>
                  <th className="py-3.5 px-6">Attendance Date</th>
                  <th className="py-3.5 px-6">Requested In</th>
                  <th className="py-3.5 px-6">Requested Out</th>
                  <th className="py-3.5 px-6">Reason & Remarks</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{r.employee_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{r.employee_id} • {r.department_name}</div>
                    </td>
                    <td className="py-3.5 px-6 font-mono font-semibold text-slate-800">
                      {r.attendance_date}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-700">
                      {r.request_type === 'MISSED_CHECK_OUT' ? (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                          Check-Out Only
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                          Check-In + Out
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-700">
                      {r.requested_check_in_display}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-700">
                      {r.requested_check_out_display}
                    </td>
                    <td className="py-3.5 px-6 max-w-xs">
                      <div className="text-slate-800 font-medium text-xs">{r.reason}</div>
                      {r.remarks && (
                        <div className="text-[11px] text-slate-400 italic mt-0.5">Note: {r.remarks}</div>
                      )}
                      {r.admin_remarks && (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded mt-1">
                          Admin Note: {r.admin_remarks}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {r.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openReviewModal(r, 'approve')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openReviewModal(r, 'reject')}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">
                          {r.reviewed_by_username ? `By ${r.reviewed_by_username}` : 'Processed'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal Dialog */}
      {selectedReq && modalAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {modalAction === 'approve' ? 'Approve Manual Attendance' : 'Reject Manual Attendance'}
              </h3>
              <button onClick={closeReviewModal} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-bold text-slate-800">{selectedReq.employee_name} ({selectedReq.employee_id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-bold text-slate-800">{selectedReq.attendance_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Request Type:</span>
                <span className="font-bold text-slate-800">
                  {selectedReq.request_type_display}
                  {selectedReq.request_type === 'MISSED_CHECK_OUT' && (
                    <div className="text-[10px] font-medium text-blue-600 mt-0.5 max-w-[220px]">
                      Approving closes the existing record. The server-recorded check-in and its
                      location are preserved.
                    </div>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Requested Hours:</span>
                <span className="font-bold text-slate-800">{selectedReq.requested_check_in_display} - {selectedReq.requested_check_out_display}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reason:</span>
                <span className="font-medium text-slate-700">{selectedReq.reason}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Remarks {modalAction === 'reject' ? '(Reason for Rejection)' : '(Optional)'}
              </label>
              <textarea
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                rows={3}
                placeholder="Enter remarks for audit trail..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={processing}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={processing}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                  modalAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {processing ? 'Processing...' : modalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
