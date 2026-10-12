import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { EmployeeScheduleEditor } from '../../components/EmployeeScheduleEditor';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { Employee, EmployeeType, Department } from '../../types';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Mail,
  Briefcase,
  Edit3,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  X,
} from 'lucide-react';

export const AdminEmployees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('');
  const [filterEmployeeType, setFilterEmployeeType] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bulk Upload State
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    detail: string;
    total_rows: number;
    created_count: number;
    updated_count: number;
    failed_count: number;
    created_employees: Array<{
      employee_id: string;
      full_name: string;
      username: string;
      password?: string;
      employee_type: EmployeeType;
      employee_type_display: string;
      action: string;
    }>;
    updated_employees: Array<{
      employee_id: string;
      full_name: string;
      username: string;
      employee_type: EmployeeType;
      employee_type_display: string;
      action: string;
    }>;
    errors: Array<{
      row_number: number;
      employee_id?: string;
      error: string;
    }>;
  } | null>(null);

  // New Employee Form State
  const [formData, setFormData] = useState({
    employee_id: '',
    full_name: '',
    username: '',
    password: '',
    email: '',
    phone: '',
    department: '',
    employee_type: 'FIELD_STAFF' as EmployeeType,
    designation: 'Field Assistant',
    joining_date: new Date().toISOString().split('T')[0],
  });
  const [creating, setCreating] = useState(false);

  // Edit Employee Form State
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    department: '',
    employee_type: 'FIELD_STAFF' as EmployeeType,
    designation: '',
    email: '',
    joining_date: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await apiClient.get('/auth/employees/', {
        params: {
          search: search || undefined,
          is_active: filterActive || undefined,
          employee_type: filterEmployeeType || undefined,
        }
      });
      setEmployees(res.data.results || res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const fetchDepartments = async () => {
    try {
      const deptRes = await apiClient.get('/auth/departments/');
      setDepartments(deptRes.data.results || deptRes.data);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchEmployees(), fetchDepartments()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [filterActive, filterEmployeeType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmployees();
  };

  const typeLabel = (code: string) =>
    activeEmployeeTypes.find((t) => t.code === code)?.name || code;

  const renderTypeOptions = (current: string) => {
    const known = activeEmployeeTypes.some((t) => t.code === current);
    return (
      <>
        {activeEmployeeTypes.map((t) => (
          <option key={t.code} value={t.code}>{t.name}</option>
        ))}
        {!known && current && (
          <option value={current}>{current}</option>
        )}
      </>
    );
  };

  const handleToggleActive = async (emp: Employee) => {
    const action = emp.is_active ? 'deactivate' : 'activate';
    const confirmMsg = emp.is_active
      ? `Are you sure you want to deactivate ${emp.full_name} (${emp.employee_id})? They will no longer be able to log in or check in.`
      : `Reactivate ${emp.full_name} (${emp.employee_id})?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiClient.post(`/auth/employees/${emp.id}/${action}/`);
      setSuccessMessage(`Employee ${emp.employee_id} ${action}d successfully.`);
      await fetchEmployees();
    } catch (err) {
      alert(`Action failed: ` + extractErrorMessage(err));
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        department: formData.department ? Number(formData.department) : null,
      };
      await apiClient.post('/auth/employees/', payload);
      setSuccessMessage(`Employee ${formData.full_name} (${formData.employee_id}) registered successfully.`);
      setShowAddModal(false);
      setFormData({
        employee_id: '',
        full_name: '',
        username: '',
        password: '',
        email: '',
        phone: '',
        department: '',
        employee_type: 'FIELD_STAFF',
        designation: 'Field Assistant',
        joining_date: new Date().toISOString().split('T')[0],
      });
      await fetchEmployees();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditFormData({
      full_name: emp.full_name,
      phone: emp.phone || '',
      department: emp.department ? String(emp.department) : '',
      employee_type: emp.employee_type || 'FIELD_STAFF',
      designation: emp.designation || 'Field Assistant',
      email: emp.email || '',
      joining_date: emp.joining_date || new Date().toISOString().split('T')[0],
    });
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setSavingEdit(true);
    setError(null);

    try {
      const payload = {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        employee_type: editFormData.employee_type,
        designation: editFormData.designation,
        department: editFormData.department ? Number(editFormData.department) : null,
        email: editFormData.email,
        joining_date: editFormData.joining_date,
      };
      await apiClient.patch(`/auth/employees/${editingEmployee.id}/`, payload);
      setSuccessMessage(`Updated profile for ${editingEmployee.full_name}.`);
      setEditingEmployee(null);
      await fetchEmployees();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDownloadTemplate = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    try {
      setDownloadingTemplate(true);
      const res = await apiClient.get(`/auth/employees/bulk-template/?file_type=${format}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv;charset=utf-8;'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fra_employee_bulk_upload_template.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download template: ' + extractErrorMessage(err));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setBulkUploadError('Please select an Excel (.xlsx) or CSV (.csv) file to upload.');
      return;
    }

    setBulkUploading(true);
    setBulkUploadError(null);

    try {
      const formPayload = new FormData();
      formPayload.append('file', selectedFile);

      const res = await apiClient.post('/auth/employees/bulk-upload/', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadResult(res.data);
      setSuccessMessage(res.data.detail || 'Bulk upload completed successfully.');
      await fetchEmployees();
    } catch (err) {
      setBulkUploadError(extractErrorMessage(err));
    } finally {
      setBulkUploading(false);
    }
  };

  const handleCopyBulkCredentials = () => {
    if (!uploadResult?.created_employees?.length) return;
    const lines = uploadResult.created_employees.map(
      (e) => `ID: ${e.employee_id} | Name: ${e.full_name} | Type: ${e.employee_type_display} | Username: ${e.username} | Password: ${e.password || 'auto-generated'}`
    );
    const textToCopy = `FRA - Newly Provisioned Employees (${uploadResult.created_employees.length}):\n\n` + lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Employee Accounts</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Field Staff &amp; Interns
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage field staff and intern user accounts and their employment classification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowBulkUploadModal(true);
              setUploadResult(null);
              setSelectedFile(null);
              setBulkUploadError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="Bulk upload employees using Excel (.xlsx) or CSV"
          >
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <span>Bulk Upload</span>
          </button>

          <button
            onClick={() => {
              setShowAddModal(true);
              setError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add Employee
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-sm font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by ID, name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterEmployeeType}
            onChange={(e) => setFilterEmployeeType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Employee Types</option>
            {activeEmployeeTypes.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>

          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Profiles</option>
            <option value="true">Active Only</option>
            <option value="false">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No employee profiles found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Account &amp; Employee Details</th>
                  <th className="py-3.5 px-6">Employee Type</th>
                  <th className="py-3.5 px-6">Department</th>
                  <th className="py-3.5 px-6">Contact</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{emp.full_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{emp.employee_id} • {emp.designation}</div>
                      <div className="text-[11px] text-blue-600 font-mono font-medium mt-0.5">
                        @{emp.username || emp.employee_id}
                      </div>
                    </td>

                    {/* Employee Type */}
                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                        emp.employee_type === 'INTERN'
                          ? 'bg-violet-50 border-violet-200 text-violet-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}>
                        <Briefcase className="w-3.5 h-3.5 shrink-0" />
                        <span>{emp.employee_type_display || typeLabel(emp.employee_type)}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-xs text-slate-700 font-medium">
                      {emp.department_name || '--'}
                    </td>

                    <td className="py-3.5 px-6 text-xs text-slate-600">
                      <div>{emp.phone || '--'}</div>
                      <div className="text-slate-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {emp.email || '--'}
                      </div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        emp.is_active
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-500 border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {emp.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(emp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                        title="Edit employee profile"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleToggleActive(emp)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          emp.is_active
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {emp.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Employee Profile</h3>
                <p className="text-xs text-slate-400">{editingEmployee.employee_id} • {editingEmployee.full_name}</p>
              </div>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employee Type *</label>
                  <select
                    value={editFormData.employee_type}
                    onChange={(e) => setEditFormData({ ...editFormData, employee_type: e.target.value as EmployeeType })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {renderTypeOptions(editFormData.employee_type)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                  <select
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={editFormData.designation}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={editFormData.joining_date}
                    onChange={(e) => setEditFormData({ ...editFormData, joining_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="name@fams.org"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Standing weekly duty pattern. Saves on its own so the employee
                  profile form and the schedule are independent submissions. */}
              <div className="pt-3 border-t border-slate-100">
                <EmployeeScheduleEditor
                  employeeId={editingEmployee.id}
                  onSaved={(message) => {
                    setSuccessMessage(message);
                    setError(null);
                  }}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Employee</h3>
                <p className="text-xs text-slate-400">Register a Field Staff member or Intern</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateEmployee} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employee ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FA-005"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Abdul Karim"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employee Type *</label>
                  <select
                    value={formData.employee_type}
                    onChange={(e) => setFormData({ ...formData, employee_type: e.target.value as EmployeeType })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {renderTypeOptions(formData.employee_type)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Dept --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Login Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. fa005"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 8 chars, mixed"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    At least 8 characters with a lowercase, uppercase, digit, and symbol.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+8801..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="name@fams.org"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={creating}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                >
                  {creating ? 'Saving Employee...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* BULK UPLOAD MODAL                                         */}
      {/* ========================================================= */}
      {showBulkUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shadow-2xs">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Employees Bulk Upload
                  </h3>
                  <p className="text-xs text-slate-500">
                    Import multiple employees via Excel (.xlsx) or CSV with Employee Type classification.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkUploadModal(false);
                  setUploadResult(null);
                  setSelectedFile(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If Results are available, show Results View */}
            {uploadResult ? (
              <div className="space-y-4">
                {/* Result Status Banner */}
                <div
                  className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    uploadResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50 border-rose-200 text-rose-950'
                  }`}
                >
                  {uploadResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-sm mb-0.5">{uploadResult.detail}</div>
                    <div className="text-slate-600">
                      Total Rows: <strong>{uploadResult.total_rows}</strong> • Created: <strong className="text-emerald-700">{uploadResult.created_count}</strong> • Updated: <strong className="text-blue-700">{uploadResult.updated_count}</strong> • Failed: <strong className="text-rose-700">{uploadResult.failed_count}</strong>
                    </div>
                  </div>
                </div>

                {/* Summary Stat Pills */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-400 font-bold uppercase text-[10px]">Total</div>
                    <div className="text-lg font-mono font-black text-slate-900">{uploadResult.total_rows}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-emerald-600 font-bold uppercase text-[10px]">Created</div>
                    <div className="text-lg font-mono font-black text-emerald-700">+{uploadResult.created_count}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-blue-600 font-bold uppercase text-[10px]">Updated</div>
                    <div className="text-lg font-mono font-black text-blue-700">{uploadResult.updated_count}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                    <div className="text-rose-600 font-bold uppercase text-[10px]">Failed</div>
                    <div className="text-lg font-mono font-black text-rose-700">{uploadResult.failed_count}</div>
                  </div>
                </div>

                {/* Newly Created Employees Table & Copy Credentials */}
                {uploadResult.created_employees?.length > 0 && (
                  <div className="space-y-2 border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <span>Provisioned Accounts ({uploadResult.created_employees.length})</span>
                      </h4>
                      <button
                        type="button"
                        onClick={handleCopyBulkCredentials}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                      >
                        {copiedCredentials ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCredentials ? 'Copied Credentials!' : 'Copy All Logins'}</span>
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full divide-y divide-slate-100 text-xs text-left">
                        <thead className="bg-slate-50 font-bold text-slate-500 uppercase text-[10px]">
                          <tr>
                            <th className="py-2 px-3">ID</th>
                            <th className="py-2 px-3">Full Name</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3">Username</th>
                            <th className="py-2 px-3">Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {uploadResult.created_employees.map((emp) => (
                            <tr key={emp.employee_id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{emp.employee_id}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{emp.full_name}</td>
                              <td className="py-2 px-3 text-slate-700">{emp.employee_type_display || emp.employee_type}</td>
                              <td className="py-2 px-3 font-mono text-emerald-700">{emp.username}</td>
                              <td className="py-2 px-3 font-mono text-slate-500">{emp.password || 'auto-generated'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Error Summary List if any */}
                {uploadResult.errors?.length > 0 && (
                  <div className="space-y-2 border border-rose-200 rounded-2xl p-4 bg-rose-50/50 text-xs">
                    <h4 className="font-bold text-rose-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Errors / Issues ({uploadResult.errors.length})</span>
                    </h4>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {uploadResult.errors.map((err, idx) => (
                        <div key={idx} className="p-2 rounded-xl bg-white border border-rose-200 text-rose-800 flex items-start gap-2">
                          <span className="font-mono font-bold bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded text-[10px]">
                            Row {err.row_number}
                          </span>
                          <span className="font-semibold">{err.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Done & Upload Another Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadResult(null);
                      setSelectedFile(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                  >
                    Upload Another File
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkUploadModal(false)}
                    className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Upload Form View */
              <form onSubmit={handleBulkUpload} className="space-y-4">
                {/* Download Pre-Formatted Template Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Download Pre-Configured Upload Template
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Includes valid columns, sample employees, and the Employee Types guide.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={downloadingTemplate}
                      onClick={() => handleDownloadTemplate('xlsx')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{downloadingTemplate ? 'Downloading...' : 'Excel (.xlsx)'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={downloadingTemplate}
                      onClick={() => handleDownloadTemplate('csv')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                {/* Drag and Drop File Upload Area */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Select File (.xlsx or .csv) *
                  </label>
                  <div
                    onClick={() => document.getElementById('bulk-file-input')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      selectedFile
                        ? 'border-emerald-500 bg-emerald-50/30'
                        : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/20'
                    }`}
                  >
                    <input
                      id="bulk-file-input"
                      type="file"
                      accept=".xlsx,.csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0]);
                          setBulkUploadError(null);
                        }
                      }}
                    />

                    {selectedFile ? (
                      <div className="space-y-1">
                        <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <Check className="w-5 h-5" />
                        </div>
                        <div className="text-xs font-bold text-slate-900">{selectedFile.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                          }}
                          className="text-[11px] font-bold text-rose-600 hover:underline pt-1"
                        >
                          Choose different file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                          <UploadCloud className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="text-xs font-bold text-slate-800">
                          Click to browse or drag and drop your file here
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Supports Microsoft Excel (.xlsx) and standard Comma-Separated Values (.csv)
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error Banner if any */}
                {bulkUploadError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{bulkUploadError}</span>
                  </div>
                )}

                {/* Submit / Cancel Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBulkUploadModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={bulkUploading || !selectedFile}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <UploadCloud className={`w-4 h-4 ${bulkUploading ? 'animate-bounce' : ''}`} />
                    <span>{bulkUploading ? 'Processing File...' : 'Upload & Provision'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
