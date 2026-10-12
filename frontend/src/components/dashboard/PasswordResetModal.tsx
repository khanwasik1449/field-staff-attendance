import React, { useEffect, useRef, useState } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import type { Employee } from '../../types';
import { KeyRound, X, CheckCircle2, Copy, Check, Sparkles, Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordResetModalProps {
  open: boolean;
  initialEmployeeId: string;
  employees: Employee[];
  onClose: () => void;
}

interface ResetResult {
  empName: string;
  empId: string;
  username: string;
  secretText: string;
  message: string;
}

/**
 * Admin-only credential reset for Field Assistants. Resets the login password;
 * the account signs in with Employee ID + password. Kept self-contained so the
 * dashboard only tracks whether the modal is open and which assistant it was
 * launched for.
 */
export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  open,
  initialEmployeeId,
  employees,
  onClose,
}) => {
  const [resetEmpId, setResetEmpId] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  const employeesRef = useRef(employees);
  employeesRef.current = employees;

  useEffect(() => {
    if (!open) return;
    setResetError(null);
    setResetSuccess(null);
    setCopied(false);
    setNewPassword('');
    setShowPasswordText(false);
    setResetEmpId(initialEmployeeId || employeesRef.current[0]?.employee_id || '');
  }, [open, initialEmployeeId]);

  if (!open) return null;

  const selectedEmployee = employees.find((emp) => emp.employee_id === resetEmpId);

  const generateRandomPassword = () => {
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const body = Array.from({ length: 4 }, () => lower[Math.floor(Math.random() * lower.length)]).join('');
    const nums = Array.from({ length: 2 }, () => digits[Math.floor(Math.random() * digits.length)].toString()).join('');
    setNewPassword(`F${body}${nums}#`);
    setShowPasswordText(true);
  };

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmpId) {
      setResetError('Please select a Field Assistant.');
      return;
    }
    if (!newPassword || newPassword.trim().length < 8) {
      setResetError('Password must be at least 8 characters long.');
      return;
    }

    setResetSubmitting(true);
    setResetError(null);

    try {
      const res = await apiClient.post('/auth/employees/quick-reset-password/', {
        employee_id: resetEmpId,
        new_password: newPassword.trim(),
      });

      setResetSuccess({
        empName: res.data.full_name || 'Field Assistant',
        empId: res.data.employee_id || resetEmpId,
        username: res.data.username || selectedEmployee?.username || '',
        secretText: newPassword.trim(),
        message: 'Password reset successfully.',
      });
    } catch (err) {
      setResetError(extractErrorMessage(err));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!resetSuccess) return;
    const textToCopy = `Field Assistant Login:\nEmployee ID: ${selectedEmployee?.employee_id}\nPassword: ${resetSuccess.secretText}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">Reset Field Assistant Login</h3>
              <p className="text-xs text-slate-400">Set a new password for the assistant</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {resetError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
            {resetError}
          </div>
        )}

        {resetSuccess ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Password Updated Successfully!</span>
              </div>
              <p className="text-xs text-emerald-700">
                {resetSuccess.message} Assistant: <strong>{resetSuccess.empName}</strong> ({resetSuccess.empId}).
              </p>

              <div className="mt-3 p-3 bg-white rounded-xl border border-emerald-200 space-y-1 font-mono text-xs text-slate-800">
                <div><strong>Employee ID:</strong> <span className="font-bold text-slate-900">{resetSuccess.empId}</span></div>
                <div><strong>Password:</strong> <span className="font-bold text-amber-700">{resetSuccess.secretText}</span></div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Credentials Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Login Credentials</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleExecuteResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Field Assistant
              </label>
              <select
                value={resetEmpId}
                onChange={(e) => setResetEmpId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.full_name} ({emp.employee_id}) — User: {emp.username || emp.employee_id.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  New Password
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate Random</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showPasswordText ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 8 chars)"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordText(!showPasswordText)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                At least 8 characters with uppercase, lowercase, a digit, and a symbol.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={resetSubmitting}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{resetSubmitting ? 'Updating...' : 'Confirm & Reset'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};