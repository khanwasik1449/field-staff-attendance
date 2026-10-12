import React, { useState } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { RotateCcw, X } from 'lucide-react';

export interface ResetDutyTarget {
  isOpen: boolean;
  employeeId?: string;
  employeeName: string;
  isAll: boolean;
}

interface ResetDutyModalProps {
  target: ResetDutyTarget | null;
  onClose: () => void;
  onConfirmed: (detail: string) => void;
}

/**
 * Confirmation dialog for clearing today's attendance session(s). The parent
 * owns the toast + refresh; this component owns the request lifecycle.
 */
export const ResetDutyModal: React.FC<ResetDutyModalProps> = ({ target, onClose, onConfirmed }) => {
  const [submitting, setSubmitting] = useState(false);

  if (!target?.isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient.post('/attendance/admin/reset-duty/', {
        employee_id: target.isAll ? 'ALL' : target.employeeId,
      });
      onConfirmed(res.data.detail || 'Duty reset successfully.');
    } catch (err) {
      alert(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-rose-600">
            <RotateCcw className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 text-base">
              {target.isAll ? "Reset All Field Assistants' Duty" : `Reset Duty for ${target.employeeName}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            {target.isAll ? (
              <>
                Are you sure you want to <strong>reset today's duty for ALL field assistants</strong>?
                This will clear today's attendance sessions, allowing all staff to check in afresh.
              </>
            ) : (
              <>
                Are you sure you want to reset today's duty for <strong>{target.employeeName}</strong>?
                This will clear their punch record for today so they can check in again.
              </>
            )}
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
            <strong>Audit Note:</strong> An immutable audit log entry will be permanently appended for this action.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
            <span>{submitting ? 'Resetting...' : 'Confirm Reset'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
