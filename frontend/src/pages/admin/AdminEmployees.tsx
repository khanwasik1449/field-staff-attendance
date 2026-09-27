import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { EmployeeScheduleEditor } from '../../components/EmployeeScheduleEditor';
import { Employee, Project, Department } from '../../types';
import {
  BANGLADESH_DIVISIONS,
  BANGLADESH_GEO,
  getDistrictsForDivision,
  getUpazilasForDistrict,
  getDistrictDivision,
  getDistrictCenter
} from '../../data/bangladeshGeo';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Phone,
  Mail,
  Building2,
  Briefcase,
  MapPin,
  Edit3,
  ArrowUpRight,
  Plus,
  Navigation,
  Globe2,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  RotateCcw,
  X,
  FileText,
  Layers
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

interface AdminEmployeesProps {
  initialTab?: 'assistants' | 'locations';
}

export const AdminEmployees: React.FC<AdminEmployeesProps> = ({ initialTab }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab');
  const getInitialTab = (): 'assistants' | 'locations' => {
    if (initialTab) return initialTab;
    if (queryTab === 'projects' || queryTab === 'locations') return 'locations';
    return 'assistants';
  };

  const [activeTab, setActiveTab] = useState<'assistants' | 'locations'>(getInitialTab);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('');
  const [filterDivision, setFilterDivision] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (queryTab === 'projects' || queryTab === 'locations') {
      setActiveTab('locations');
    } else if (queryTab === 'assistants' || queryTab === 'accounts') {
      setActiveTab('assistants');
    }
  }, [initialTab, queryTab]);

  // Bulk Upload State
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultBulkProject, setDefaultBulkProject] = useState<string>('');
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
      project_code: string;
      project_name: string;
      district: string;
      action: string;
    }>;
    updated_employees: Array<{
      employee_id: string;
      full_name: string;
      username: string;
      project_code: string;
      project_name: string;
      district: string;
      action: string;
    }>;
    errors: Array<{
      row_number: number;
      employee_id?: string;
      error: string;
    }>;
  } | null>(null);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'bulk-upload') {
      setShowBulkUploadModal(true);
    } else if (action === 'add-project' || action === 'add-location' || action === 'new-project') {
      setActiveTab('locations');
      setShowAddLocationModal(true);
    } else if (action === 'add-assistant' || action === 'add-employee' || action === 'new-assistant') {
      setActiveTab('assistants');
      setShowAddModal(true);
    }
  }, [searchParams]);

  // New Employee Form State with Bangladesh District & Zilla hierarchy
  const [formData, setFormData] = useState({
    employee_id: '',
    full_name: '',
    username: '',
    password: '',
    email: '',
    phone: '',
    division: '',
    district: '',
    upazila: '',
    department: '',
    project: '',
    designation: 'Field Assistant',
    joining_date: new Date().toISOString().split('T')[0],
  });
  const [creating, setCreating] = useState(false);

  // Edit Employee Form State
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    division: '',
    district: '',
    upazila: '',
    department: '',
    project: '',
    designation: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // New Work Location Form State (Coordinates automatically filled from District!)
  const [locationFormData, setLocationFormData] = useState({
    name: '',
    code: '',
    description: '',
    division: 'Dhaka',
    district: 'Dhaka',
    upazila: '',
    latitude: '23.8103',
    longitude: '90.4125',
    radius_meters: 1000,
  });
  const [showAdvancedCoordinates, setShowAdvancedCoordinates] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await apiClient.get('/auth/employees/', {
        params: {
          search: search || undefined,
          is_active: filterActive || undefined,
        }
      });
      setEmployees(res.data.results || res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const fetchProjectsAndDepartments = async () => {
    try {
      const [projRes, deptRes] = await Promise.all([
        apiClient.get('/auth/projects/'),
        apiClient.get('/auth/departments/')
      ]);
      setProjects(projRes.data.results || projRes.data);
      setDepartments(deptRes.data.results || deptRes.data);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchEmployees(), fetchProjectsAndDepartments()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [filterActive]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmployees();
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
      const payload: any = {
        ...formData,
        department: formData.department ? Number(formData.department) : null,
        project: formData.project ? Number(formData.project) : null,
      };
      await apiClient.post('/auth/employees/', payload);
      setSuccessMessage(`Field Assistant ${formData.full_name} (${formData.employee_id}) assigned to ${formData.district || 'district'} registered successfully.`);
      setShowAddModal(false);
      setFormData({
        employee_id: '',
        full_name: '',
        username: '',
        password: '',
        email: '',
        phone: '',
        division: '',
        district: '',
        upazila: '',
        department: '',
        project: '',
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
    const div = emp.division || (emp.district ? getDistrictDivision(emp.district) : '') || '';
    setEditFormData({
      full_name: emp.full_name,
      phone: emp.phone || '',
      division: div,
      district: emp.district || '',
      upazila: emp.upazila || '',
      department: emp.department ? String(emp.department) : '',
      project: emp.project ? String(emp.project) : '',
      designation: emp.designation || 'Field Assistant',
    });
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setSavingEdit(true);
    setError(null);

    try {
      const payload: any = {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        division: editFormData.division,
        district: editFormData.district,
        upazila: editFormData.upazila,
        designation: editFormData.designation,
        department: editFormData.department ? Number(editFormData.department) : null,
        project: editFormData.project ? Number(editFormData.project) : null,
      };
      await apiClient.patch(`/auth/employees/${editingEmployee.id}/`, payload);
      setSuccessMessage(`Updated district assignment for ${editingEmployee.full_name} (${editFormData.district || 'Unassigned'}).`);
      setEditingEmployee(null);
      await fetchEmployees();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  // When admin picks a district for a new location, auto-populate authoritative GPS center coordinates!
  const handleLocationDistrictSelect = (dist: string) => {
    const center = getDistrictCenter(dist);
    const div = getDistrictDivision(dist) || locationFormData.division;
    setLocationFormData(prev => ({
      ...prev,
      district: dist,
      division: div,
      upazila: '',
      latitude: center ? String(center.lat) : prev.latitude,
      longitude: center ? String(center.lon) : prev.longitude,
    }));
  };

  const handleLocationDivisionSelect = (div: string) => {
    const dists = getDistrictsForDivision(div);
    const firstDist = dists[0] || '';
    const center = firstDist ? getDistrictCenter(firstDist) : null;
    setLocationFormData(prev => ({
      ...prev,
      division: div,
      district: firstDist,
      upazila: '',
      latitude: center ? String(center.lat) : prev.latitude,
      longitude: center ? String(center.lon) : prev.longitude,
    }));
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLocation(true);
    setError(null);

    try {
      const payload = {
        name: locationFormData.name,
        code: locationFormData.code,
        description: locationFormData.description,
        division: locationFormData.division,
        district: locationFormData.district,
        upazila: locationFormData.upazila,
        latitude: locationFormData.latitude ? Number(locationFormData.latitude) : null,
        longitude: locationFormData.longitude ? Number(locationFormData.longitude) : null,
        radius_meters: Number(locationFormData.radius_meters) || 1000,
      };
      await apiClient.post('/auth/projects/', payload);
      setSuccessMessage(`New work location '${locationFormData.name}' (${locationFormData.district}) registered successfully.`);
      setShowAddLocationModal(false);
      setLocationFormData({
        name: '',
        code: '',
        description: '',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: '',
        latitude: '23.8103',
        longitude: '90.4125',
        radius_meters: 1000,
      });
      await fetchProjectsAndDepartments();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreatingLocation(false);
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
      link.download = `fra_fa_bulk_upload_template.${format}`;
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
      if (defaultBulkProject) {
        formPayload.append('default_project_id', defaultBulkProject);
      }

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
      (e) => `ID: ${e.employee_id} | Name: ${e.full_name} | Username: ${e.username} | Password: ${e.password || 'password123'} | Project: ${e.project_name || e.project_code}`
    );
    const textToCopy = `FRA - Newly Provisioned Field Research Assistants (${uploadResult.created_employees.length}):\n\n` + lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  const filteredEmployees = employees.filter(emp => {
    if (!filterDivision) return true;
    const empDiv = emp.division || (emp.district ? getDistrictDivision(emp.district) : '') || '';
    return empDiv.toLowerCase() === filterDivision.toLowerCase();
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Accounts, Field Assistants & Projects</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Bangladesh 64 Districts
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage field assistant user accounts and operational project sites across Bangladesh divisions and districts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'assistants' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowBulkUploadModal(true);
                  setUploadResult(null);
                  setSelectedFile(null);
                  setBulkUploadError(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                title="Bulk upload Field Assistants using Excel (.xlsx) or CSV"
              >
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                <span>Bulk Upload FAs</span>
              </button>

              <button
                onClick={() => {
                  setShowAddModal(true);
                  setError(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Add Assistant by District
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setShowAddLocationModal(true);
                setError(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + Add New Project / Site
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => {
            setActiveTab('assistants');
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.set('tab', 'accounts');
              return next;
            });
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'assistants'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts & Field Assistants ({employees.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('locations');
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.set('tab', 'projects');
              return next;
            });
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'locations'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Projects & Work Sites ({projects.length})</span>
        </button>
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

      {activeTab === 'assistants' ? (
        <>
          {/* Search & Filter Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by ID, name, district, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={filterDivision}
                onChange={(e) => setFilterDivision(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">All 8 Divisions</option>
                {BANGLADESH_DIVISIONS.map(div => (
                  <option key={div} value={div}>{div} Division</option>
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

          {/* Assistants Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No employee profiles found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                    <tr>
                      <th className="py-3.5 px-6">Account & Assistant Details</th>
                      <th className="py-3.5 px-6">Assigned District / Zilla (জেলা)</th>
                      <th className="py-3.5 px-6">Work Site / Project</th>
                      <th className="py-3.5 px-6">Department</th>
                      <th className="py-3.5 px-6">Contact</th>
                      <th className="py-3.5 px-6">Status</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredEmployees.map((emp) => {
                      const empDivision = emp.division || (emp.district ? getDistrictDivision(emp.district) : '') || '';
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-6">
                            <div className="font-bold text-slate-900">{emp.full_name}</div>
                            <div className="text-xs text-slate-400 font-mono">{emp.employee_id} • {emp.designation}</div>
                            <div className="text-[11px] text-blue-600 font-mono font-medium mt-0.5">
                              @{emp.username || emp.employee_id}
                            </div>
                          </td>

                          {/* Assigned District & Upazila */}
                          <td className="py-3.5 px-6">
                            {emp.district ? (
                              <div className="space-y-0.5">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>{emp.district}</span>
                                  {emp.upazila && <span className="text-emerald-700 font-medium">({emp.upazila})</span>}
                                </div>
                                {empDivision && (
                                  <div className="text-[11px] text-slate-400 pl-1 font-medium">
                                    {empDivision} Division
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => openEditModal(emp)}
                                className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium italic"
                              >
                                <span>+ Assign District / Zilla</span>
                              </button>
                            )}
                          </td>

                          {/* Project / Work Site */}
                          <td className="py-3.5 px-6">
                            {emp.project_name ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                                <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>{emp.project_name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">District-Wide / General</span>
                            )}
                          </td>

                          <td className="py-3.5 px-6 text-xs text-slate-700 font-medium">
                            {emp.department_name || '--'}
                          </td>

                          <td className="py-3.5 px-6 text-xs text-slate-600">
                            <div>{emp.phone || '--'}</div>
                            <div className="text-slate-400">{emp.email}</div>
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
                              title="Assign District or update profile"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Assign / Edit</span>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Work Locations & Sites Tab */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Configured Projects & Work Sites (প্রকল্প ও সাইটসমূহ)</h2>
              <p className="text-xs text-slate-400">All registered projects mapped to Bangladesh districts. Field assistants are assigned to these projects.</p>
            </div>
            <button
              onClick={() => {
                setShowAddLocationModal(true);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              + Add Project / Work Site
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <tr>
                  <th className="py-3.5 px-6">Project / Site Name</th>
                  <th className="py-3.5 px-6">Project Code</th>
                  <th className="py-3.5 px-6">District (Zilla) & Upazila</th>
                  <th className="py-3.5 px-6">GPS Center & Maps</th>
                  <th className="py-3.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Briefcase className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-bold text-slate-700">No Projects Configured Yet</p>
                      <p className="text-xs text-slate-400 mt-1">Create your first operational project or work site to assign field assistants.</p>
                      <button
                        onClick={() => {
                          setShowAddLocationModal(true);
                          setError(null);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add First Project
                      </button>
                    </td>
                  </tr>
                ) : (
                  projects.map((proj) => {
                  const hasGeo = proj.latitude && proj.longitude;
                  return (
                    <tr key={proj.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-slate-900">{proj.name}</div>
                        {proj.description && (
                          <div className="text-xs text-slate-400 mt-0.5">{proj.description}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                          {proj.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        {proj.district ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{proj.district}</span>
                              {proj.upazila && <span className="text-slate-500 font-normal">({proj.upazila})</span>}
                            </div>
                            {proj.division && (
                              <div className="text-[11px] text-slate-400 font-medium">
                                {proj.division} Division
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Not set</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        {hasGeo ? (
                          <a
                            href={`https://www.google.com/maps?q=${proj.latitude},${proj.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                            title="Open site center coordinates in Google Maps"
                          >
                            <span>{Number(proj.latitude).toFixed(4)}, {Number(proj.longitude).toFixed(4)}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No GPS bound</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          proj.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${proj.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {proj.is_active ? 'Active Site' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Location & District / Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign District (Zilla) & Work Location</h3>
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
              {/* Bangladesh Division -> District -> Upazila cascading fields */}
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Assigned Bangladesh District / Zilla (জেলা)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Division (বিভাগ)</label>
                    <select
                      value={editFormData.division}
                      onChange={(e) => {
                        const newDiv = e.target.value;
                        setEditFormData({
                          ...editFormData,
                          division: newDiv,
                          district: '',
                          upazila: '',
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Select Division --</option>
                      {BANGLADESH_DIVISIONS.map(div => (
                        <option key={div} value={div}>{div} Division</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">District / Zilla (জেলা) *</label>
                    <select
                      value={editFormData.district}
                      onChange={(e) => {
                        const newDist = e.target.value;
                        const autoDiv = editFormData.division || getDistrictDivision(newDist) || '';
                        setEditFormData({
                          ...editFormData,
                          district: newDist,
                          division: autoDiv,
                          upazila: '',
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Select District (Zilla) --</option>
                      {editFormData.division ? (
                        getDistrictsForDivision(editFormData.division).map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))
                      ) : (
                        BANGLADESH_DIVISIONS.map(div => (
                          <optgroup key={div} label={`${div} Division`}>
                            {getDistrictsForDivision(div).map(dist => (
                              <option key={dist} value={dist}>{dist}</option>
                            ))}
                          </optgroup>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Upazila / Thana (উপজেলা / থানা)</label>
                  <select
                    value={editFormData.upazila}
                    onChange={(e) => setEditFormData({ ...editFormData, upazila: e.target.value })}
                    disabled={!editFormData.district}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">-- All Upazilas / Sadar --</option>
                    {editFormData.district && getUpazilasForDistrict(editFormData.district).map(upz => (
                      <option key={upz} value={upz}>{upz}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Check-in location will be verified against this assigned District and Upazila.
                  </p>
                </div>
              </div>

              {/* Specific Site / Project Assignment (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Optional Specific Work Location / Project Site
                </label>
                <select
                  value={editFormData.project}
                  onChange={(e) => setEditFormData({ ...editFormData, project: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- None / District-Wide Roving --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) {p.district ? `— ${p.district}` : ''}
                    </option>
                  ))}
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={editFormData.designation}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
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
                  {savingEdit ? 'Saving Changes...' : 'Save District Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal by Bangladesh District */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Field Assistant by District</h3>
                <p className="text-xs text-slate-400">Register FA and assign to Bangladesh District (Zilla)</p>
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

              {/* Bangladesh District & Upazila selection */}
              <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Assigned Work District / Zilla (জেলা)</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Division (বিভাগ)</label>
                    <select
                      value={formData.division}
                      onChange={(e) => {
                        const newDiv = e.target.value;
                        setFormData({
                          ...formData,
                          division: newDiv,
                          district: '',
                          upazila: '',
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Any Division --</option>
                      {BANGLADESH_DIVISIONS.map(div => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">District (জেলা) *</label>
                    <select
                      required
                      value={formData.district}
                      onChange={(e) => {
                        const newDist = e.target.value;
                        const autoDiv = formData.division || getDistrictDivision(newDist) || '';
                        setFormData({
                          ...formData,
                          district: newDist,
                          division: autoDiv,
                          upazila: '',
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Select District (Zilla) --</option>
                      {formData.division ? (
                        getDistrictsForDivision(formData.division).map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))
                      ) : (
                        BANGLADESH_DIVISIONS.map(div => (
                          <optgroup key={div} label={`${div} Division`}>
                            {getDistrictsForDivision(div).map(dist => (
                              <option key={dist} value={dist}>{dist}</option>
                            ))}
                          </optgroup>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Upazila / Thana (উপজেলা / থানা)</label>
                  <select
                    value={formData.upazila}
                    onChange={(e) => setFormData({ ...formData, upazila: e.target.value })}
                    disabled={!formData.district}
                    className="w-full px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">-- All Upazilas / Sadar --</option>
                    {formData.district && getUpazilasForDistrict(formData.district).map(upz => (
                      <option key={upz} value={upz}>{upz}</option>
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
                    placeholder="Min 6 chars"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Work Location & Department */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Optional Specific Site</label>
                  <select
                    value={formData.project}
                    onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- None / District-Wide --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
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
                  {creating ? 'Saving Assistant...' : 'Save Field Assistant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Work Location / Site Modal - Auto GPS Coordinates from District */}
      {showAddLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add New Project / Work Site (নতুন প্রকল্প / সাইট)</h3>
                <p className="text-xs text-slate-400">Set the project name and code, and select district for auto GPS mapping</p>
              </div>
              <button onClick={() => setShowAddLocationModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateLocation} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Project Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dhaka Urban Survey"
                    value={locationFormData.name}
                    onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Project Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DHK-01"
                    value={locationFormData.code}
                    onChange={(e) => setLocationFormData({ ...locationFormData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Bangladesh Division -> District -> Upazila Auto GPS Mapping */}
              <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-200 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Location District / Zilla (জেলা)</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Division (বিভাগ) *</label>
                    <select
                      value={locationFormData.division}
                      onChange={(e) => handleLocationDivisionSelect(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-blue-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {BANGLADESH_DIVISIONS.map(div => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">District (জেলা) *</label>
                    <select
                      required
                      value={locationFormData.district}
                      onChange={(e) => handleLocationDistrictSelect(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-blue-300 bg-white text-xs font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {getDistrictsForDivision(locationFormData.division).map(dist => (
                        <option key={dist} value={dist}>{dist}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Upazila / Thana (উপজেলা / থানা)</label>
                  <select
                    value={locationFormData.upazila}
                    onChange={(e) => setLocationFormData({ ...locationFormData, upazila: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-blue-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- All Upazilas / Sadar --</option>
                    {locationFormData.district && getUpazilasForDistrict(locationFormData.district).map(upz => (
                      <option key={upz} value={upz}>{upz}</option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-[10px] text-blue-700 font-medium mt-1">
                    <span>✓ Center GPS: {locationFormData.latitude}, {locationFormData.longitude}</span>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCoordinates(!showAdvancedCoordinates)}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      {showAdvancedCoordinates ? 'Hide Custom Coordinates' : 'Custom GPS Coordinates?'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Advanced Coordinates Accordion */}
              {showAdvancedCoordinates && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={locationFormData.latitude}
                      onChange={(e) => setLocationFormData({ ...locationFormData, latitude: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={locationFormData.longitude}
                      onChange={(e) => setLocationFormData({ ...locationFormData, longitude: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}


              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddLocationModal(false)}
                  disabled={creatingLocation}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLocation}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  {creatingLocation ? 'Saving Project...' : 'Save Project Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* BULK UPLOAD MODAL FOR PROJECT-BASED FIELD ASSISTANTS       */}
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
                    Project-Based Field Assistants Bulk Upload
                  </h3>
                  <p className="text-xs text-slate-500">
                    Import multiple field assistants via Excel (.xlsx) or CSV with automatic project and district provisioning.
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

                {/* Newly Created Assistants Table & Copy Credentials */}
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
                            <th className="py-2 px-3">Username</th>
                            <th className="py-2 px-3">Password</th>
                            <th className="py-2 px-3">Project Site</th>
                            <th className="py-2 px-3">District</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {uploadResult.created_employees.map((emp) => (
                            <tr key={emp.employee_id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{emp.employee_id}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{emp.full_name}</td>
                              <td className="py-2 px-3 font-mono text-emerald-700">{emp.username}</td>
                              <td className="py-2 px-3 font-mono text-slate-500">{emp.password || 'password123'}</td>
                              <td className="py-2 px-3 text-slate-700">{emp.project_name || emp.project_code}</td>
                              <td className="py-2 px-3 text-slate-500">{emp.district}</td>
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
                        Includes valid columns, sample field assistants, and active project code guide.
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

                {/* Optional Default Project Fallback Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Default Project Assignment <span className="text-slate-400 font-normal">(Optional fallback)</span>
                  </label>
                  <select
                    value={defaultBulkProject}
                    onChange={(e) => setDefaultBulkProject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">-- Match project codes inside the file --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) • {p.district || 'General'}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    If any row in the spreadsheet leaves the Project column blank, this project will be assigned automatically.
                  </p>
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
                    <span>{bulkUploading ? 'Processing File...' : 'Upload & Provision FAs'}</span>
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
