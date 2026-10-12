import React, { useState } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { EmployeeTypeOption } from '../../types';
import {
  BarChart2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Loader2,
} from 'lucide-react';

export const AdminEmployeeTypes: React.FC = () => {
  const { types, loading, refresh } = useEmployeeTypes();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EmployeeTypeOption | null>(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm({ code: '', name: '' });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (t: EmployeeTypeOption) => {
    setEditing(t);
    setForm({ code: t.code, name: t.name });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(editing ? {} : { code: form.code.trim().toUpperCase() }),
        name: form.name.trim(),
      };
      if (editing) {
        await apiClient.patch(`/auth/employee-types/${editing.id}/`, payload);
        setMessage(`Employee type "${form.name}" updated.`);
      } else {
        await apiClient.post('/auth/employee-types/', payload);
        setMessage(`Employee type "${form.name}" created.`);
      }
      setShowModal(false);
      await refresh();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: EmployeeTypeOption) => {
    const confirmMsg = t.is_active
      ? `Deactivate "${t.name}"? Existing employees keep this type, but it won't be assignable to new ones.`
      : `Reactivate "${t.name}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await apiClient.patch(`/auth/employee-types/${t.id}/`, { is_active: !t.is_active });
      setMessage(`Employee type "${t.name}" ${t.is_active ? 'deactivated' : 'reactivated'}.`);
      await refresh();
    } catch (err) {
      alert('Action failed: ' + extractErrorMessage(err));
    }
  };

  const handleDelete = async (t: EmployeeTypeOption) => {
    if (!window.confirm(`Delete employee type "${t.name}" permanently?`)) return;
    try {
      await apiClient.delete(`/auth/employee-types/${t.id}/`);
      setMessage(`Employee type "${t.name}" deleted.`);
      await refresh();
    } catch (err) {
      alert('Delete failed: ' + extractErrorMessage(err));
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Employee Types</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Classification Catalog
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Add, rename, deactivate, or remove the classifications assigned to field assistants.
            Existing records keep their type label when you deactivate it.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Employee Type
        </button>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Type</th>
                  <th className="py-3.5 px-6">Code</th>
                  <th className="py-3.5 px-6">Employees</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {types.map((t) => (
                  <tr key={t.code} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-xl bg-slate-100 text-slate-600">
                          <Briefcase className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{t.name}</div>
                          {t.employee_count === 0 && (
                            <div className="text-[11px] text-slate-400">Not assigned</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-xs text-slate-600">{t.code}</td>
                    <td className="py-3.5 px-6">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                        <BarChart2 className="w-3.5 h-3.5 text-slate-400" />
                        {t.employee_count ?? 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        t.is_active
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-500 border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openEdit(t)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                        title="Edit employee type"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(t)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          t.is_active
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title={t.is_active ? 'Deactivate type' : 'Reactivate type'}
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={!!t.employee_count}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          t.employee_count
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                        title={t.employee_count ? 'Cannot delete: assigned to employees. Deactivate instead.' : 'Delete permanently'}
                      >
                        <Trash2 className="w-3.5 h-3.5 inline mr-0.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editing ? `Edit "${editing.name}"` : 'Add Employee Type'}
                </h3>
                <p className="text-xs text-slate-400">
                  {editing
                    ? 'Rename the type or toggle its status. The code stays stable for existing records.'
                    : 'Assignable to field assistants in the employee forms and reports.'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              {!editing && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SUPERVISOR"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Uppercase machine code stored on employee records. Cannot be changed later.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Name (Label) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Field Supervisor"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Shown in employee lists, forms, and reports.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};