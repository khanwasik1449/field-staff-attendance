import React, { useState, useEffect, useMemo } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { Employee } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Printer,
  Search,
  Phone,
  Mail,
  Building2,
  Clock,
  Briefcase,
  MapPin,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  FileText,
  User,
  ShieldCheck
} from 'lucide-react';

interface EmployeeReportData {
  employee: Employee;
  summary: {
    start_date: string;
    end_date: string;
    total_days_range: number;
    present_days: number;
    late_days: number;
    absent_days: number;
    leave_days?: number;
    holiday_days?: number;
    weekend_days?: number;
    future_days?: number;
    manual_days: number;
    pending_approval_days?: number;
    rejected_days?: number;
    total_working_hours: string;
    total_working_minutes: number;
  };
  daily_records: {
    date: string;
    check_in: string;
    check_out: string;
    duration: string;
    type: string;
    status: string;
    approved_by: string;
    remarks: string;
    check_in_latitude?: number | null;
    check_in_longitude?: number | null;
    check_in_accuracy?: number | null;
    check_in_address?: string;
    check_out_latitude?: number | null;
    check_out_longitude?: number | null;
    check_out_address?: string;
  }[];
}

type PeriodMode = 'thisMonth' | 'lastMonth' | 'custom';

const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Full calendar-month bounds, offset 0 = current month, -1 = previous month.
const monthBounds = (offset: number): { start: string; end: string } => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: toISODate(first), end: toISODate(last) };
};

// Latest end date allowed for a given start so the window never exceeds 1 month.
const maxEndFor = (startIso: string): string => {
  const d = new Date(startIso + 'T00:00:00');
  const targetM = d.getMonth() + 1;
  const lastDayOfTarget = new Date(d.getFullYear(), targetM + 1, 0).getDate();
  const end = new Date(d.getFullYear(), targetM, Math.min(d.getDate(), lastDayOfTarget));
  end.setDate(end.getDate() - 1);
  return toISODate(end);
};

export const AdminEmployeeReport: React.FC = () => {
  const initialMonth = monthBounds(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('thisMonth');
  const [startDate, setStartDate] = useState(initialMonth.start);
  const [endDate, setEndDate] = useState(initialMonth.end);
  const [report, setReport] = useState<EmployeeReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPeriod = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode === 'thisMonth') {
      const b = monthBounds(0);
      setStartDate(b.start);
      setEndDate(b.end);
    } else if (mode === 'lastMonth') {
      const b = monthBounds(-1);
      setStartDate(b.start);
      setEndDate(b.end);
    }
  };

  // Custom-range handlers keep the window within a single month.
  const handleStartChange = (value: string) => {
    setPeriodMode('custom');
    setStartDate(value);
    if (endDate < value) {
      setEndDate(value);
    } else if (endDate > maxEndFor(value)) {
      setEndDate(maxEndFor(value));
    }
  };

  const handleEndChange = (value: string) => {
    setPeriodMode('custom');
    if (value < startDate) {
      setEndDate(startDate);
    } else if (value > maxEndFor(startDate)) {
      setEndDate(maxEndFor(startDate));
    } else {
      setEndDate(value);
    }
  };

  // Load employee list for dropdown
  useEffect(() => {
    apiClient.get('/auth/employees/').then((res) => {
      setEmployees(res.data.results || res.data);
    });
  }, []);

  // Employees under the selected employee type only
  const filteredEmployees = useMemo(() => {
    if (!employeeTypeFilter) return employees;
    return employees.filter((e) => e.employee_type === employeeTypeFilter);
  }, [employees, employeeTypeFilter]);

  // Auto-select the first employee of the chosen employee type
  useEffect(() => {
    if (filteredEmployees.length === 0) {
      setSelectedEmpId('');
    } else if (!filteredEmployees.some((e) => e.employee_id === selectedEmpId)) {
      setSelectedEmpId(filteredEmployees[0].employee_id);
    }
  }, [filteredEmployees, selectedEmpId]);

  const fetchReport = async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<EmployeeReportData>(`/admin/reports/employee/${selectedEmpId}/`, {
        params: { start_date: startDate, end_date: endDate, employee_type: employeeTypeFilter || undefined }
      });
      setReport(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmpId) {
      fetchReport();
    }
  }, [selectedEmpId, startDate, endDate, employeeTypeFilter]);

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!selectedEmpId) return;
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      format,
      ...(employeeTypeFilter && { employee_type: employeeTypeFilter }),
    });

    apiClient.get(`/admin/reports/employee/${selectedEmpId}/export/?${params.toString()}`, {
      responseType: 'blob',
    }).then((response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fra_employee_attendance_dossier_${selectedEmpId}_${startDate}_to_${endDate}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }).catch((err) => {
      alert('Export failed: ' + extractErrorMessage(err));
    });
  };

  // Helper to format date with day of week
  const formatRowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return {
        date: dateStr,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      };
    } catch {
      return { date: dateStr, day: '' };
    }
  };

  const punctualityScore = useMemo(() => {
    if (!report) return 0;
    const { total_days_range, weekend_days = 0, holiday_days = 0, future_days = 0 } = report.summary;
    const workingDays = Math.max(1, total_days_range - weekend_days - holiday_days - future_days);
    const attended = report.summary.present_days + report.summary.late_days;
    return Math.round((attended / workingDays) * 100);
  }, [report]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 print:p-0 print:m-0 print:max-w-none">
      {/* Print-specific style rules */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: landscape; margin: 12mm 10mm 15mm 10mm; }
          body { background: white !important; color: black !important; font-size: 11px; }
          .no-print { display: none !important; }
          .print-full { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .break-inside-avoid { page-break-inside: avoid; }
        }
      `}} />

      {/* Top Action Toolbar (Hidden during Print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-600 flex items-center justify-center text-white font-bold">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900">Individual Employee Attendance Dossier</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                Staff Profile
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Per-assistant chronological attendance history, GPS tracks, and compliance verification
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            title="Download CSV file"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            title="Download formatted Excel report"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
          <button
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            title="Print or save as official PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
          <button
            onClick={fetchReport}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selector & Date Range Toolbar (Hidden during Print) */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Filter by Employee Type
          </label>
          <div className="relative">
            <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <select
              value={employeeTypeFilter}
              onChange={(e) => setEmployeeTypeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">All Employee Types</option>
              {activeEmployeeTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Select Field Assistant
          </label>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            {employeeTypeFilter && <option value="">All employees of selected type</option>}
            {filteredEmployees.map((e) => (
              <option key={e.id} value={e.employee_id}>
                {e.employee_id} - {e.full_name} ({e.designation || 'Field Assistant'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Reporting Period (মাস/সীমা)
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            {(['thisMonth', 'lastMonth', 'custom'] as PeriodMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => applyPeriod(mode)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  periodMode === mode
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {mode === 'thisMonth' ? 'This Month' : mode === 'lastMonth' ? 'Last Month' : 'Custom'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            From Date (শুরুর তারিখ)
          </label>
          <input
            type="date"
            value={startDate}
            max={endDate}
            disabled={periodMode !== 'custom'}
            onChange={(e) => handleStartChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            To Date (শেষের তারিখ)
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={maxEndFor(startDate)}
            disabled={periodMode !== 'custom'}
            onChange={(e) => handleEndChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-end">
          <p className="text-[11px] font-medium text-slate-500 leading-snug">
            Select a whole month with <span className="font-bold text-slate-700">This Month</span> / <span className="font-bold text-slate-700">Last Month</span>,
            or pick a custom range of <span className="font-bold text-rose-600">at most 1 month</span>.
          </p>
        </div>
      </div>

      {error && (
        <div className="no-print p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      )}

      {report && !loading && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:rounded-none overflow-hidden space-y-6 p-6 sm:p-8 print:p-0">
          
          {/* Formal Corporate Letterhead Header */}
          <div className="border-b-2 border-slate-900 pb-5 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-slate-900">
              <div className="px-2 h-7 rounded-lg bg-slate-900 text-white font-black flex items-center justify-center text-xs tracking-wider print:border print:border-black">
                FRA
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
                FRA - Field Research Assistants
              </h1>
            </div>
            <div className="text-sm font-black text-slate-800 tracking-wide uppercase">
              Individual Employee Attendance Dossier & Audit Profile (ব্যক্তিগত হাজিরা বিবরণী)
            </div>

            {/* Official Document Metadata Box */}
            <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200 print:bg-transparent print:border print:border-slate-300">
              <div>
                <span className="text-slate-400 font-bold block uppercase text-[10px]">Reporting Period:</span>
                <strong className="text-slate-900 font-mono">{startDate} to {endDate}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase text-[10px]">Reference Code:</span>
                <span className="font-mono font-bold text-slate-800">FRA-EAD-{report.employee.employee_id}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase text-[10px]">Timezone Standard:</span>
                <span className="font-semibold text-slate-800">Asia/Dhaka (UTC+06:00)</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase text-[10px]">Audit Authority:</span>
                <span className="font-semibold text-cyan-800">HR Certified Dossier</span>
              </div>
            </div>
          </div>

          {/* Employee Credentials & Summary Banner */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 print:bg-transparent print:border print:border-slate-300">
            {/* Bio Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg font-mono shadow-sm">
                  {report.employee.employee_id}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 leading-tight">{report.employee.full_name}</h2>
                  <p className="text-xs font-semibold text-cyan-700">
                    {report.employee.designation || 'Field Assistant'} • {report.employee.department_name || report.employee.department || 'Operations'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{report.employee.phone || '--'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{report.employee.email || '--'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Joined: {report.employee.joining_date || '--'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="font-semibold">{report.employee.is_active ? 'Active Profile' : 'Deactivated'}</span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5 pt-1 text-[11px] font-bold text-slate-800">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Employee Type: {report.employee.employee_type_display || report.employee.employee_type}</span>
                </div>
              </div>
            </div>

            {/* Performance KPI Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">Present Days</div>
                <div className="text-xl font-black font-mono text-emerald-700">{report.summary.present_days}</div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">Late Days</div>
                <div className="text-xl font-black font-mono text-amber-700">{report.summary.late_days}</div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">Absent Days</div>
                <div className="text-xl font-black font-mono text-rose-700">{report.summary.absent_days}</div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">Manual Punches</div>
                <div className="text-xl font-black font-mono text-blue-700">{report.summary.manual_days}</div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">Attn. Rate</div>
                <div className="text-xl font-black font-mono text-cyan-700">{punctualityScore}%</div>
              </div>
              <div className="p-2.5 bg-slate-900 text-white rounded-xl text-center flex flex-col justify-center">
                <div className="text-[9px] uppercase font-bold text-slate-400">Total Hours</div>
                <div className="text-sm font-black font-mono text-emerald-400">{report.summary.total_working_hours}</div>
              </div>
            </div>
          </div>

          {/* Chronological Daily Records Table */}
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2 text-[10px] font-bold text-slate-600">
              <span className="uppercase text-slate-400 tracking-wider">Day Register:</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300"></span>Present</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300"></span>Late</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300"></span>Manual</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-100 border border-violet-300"></span>Leave</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-100 border border-sky-300"></span>Holiday</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-300"></span>Weekend</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-300"></span>Absent</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300"></span>Pending</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300"></span>Rejected</span>
            </div>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="min-w-full divide-y divide-slate-200 text-left border border-slate-200 print:text-[10px]">
              <thead className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider print:bg-slate-100 print:text-black">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3">Date & Day</th>
                  <th className="py-2.5 px-3">Check In & Location</th>
                  <th className="py-2.5 px-3">Check Out & Location</th>
                  <th className="py-2.5 px-3 text-center">Duration</th>
                  <th className="py-2.5 px-2 text-center">Type</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Verification / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {report.daily_records.map((r, idx) => {
                  const dayInfo = formatRowDate(r.date);
                  return (
                    <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold">
                        {idx + 1}
                      </td>

                      {/* Date & Day */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">{dayInfo.date}</div>
                        <div className="text-[10px] text-slate-500 font-semibold">{dayInfo.day}</div>
                      </td>

                      {/* Check In */}
                      <td className="py-2.5 px-3">
                        {r.check_in !== '--' ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-slate-900 font-bold">{r.check_in}</div>
                            {r.check_in_address && (
                              <div className="text-[10px] text-slate-600 leading-tight">
                                {r.check_in_address}
                              </div>
                            )}
                            {r.check_in_latitude && r.check_in_longitude && (
                              <div className="text-[10px] text-blue-700 font-mono">
                                GPS: {r.check_in_latitude.toFixed(4)}, {r.check_in_longitude.toFixed(4)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-slate-400">--</span>
                        )}
                      </td>

                      {/* Check Out */}
                      <td className="py-2.5 px-3">
                        {r.check_out !== '--' ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-slate-900 font-bold">{r.check_out}</div>
                            {r.check_out_address && (
                              <div className="text-[10px] text-slate-600 leading-tight">
                                {r.check_out_address}
                              </div>
                            )}
                            {r.check_out_latitude && r.check_out_longitude && (
                              <div className="text-[10px] text-blue-700 font-mono">
                                GPS: {r.check_out_latitude.toFixed(4)}, {r.check_out_longitude.toFixed(4)}
                              </div>
                            )}
                          </div>
                        ) : r.check_in !== '--' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Active On Duty
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400">--</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                        {r.duration}
                      </td>

                      {/* Type */}
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.type === 'MANUAL'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : r.type === 'AUTOMATIC'
                            ? 'bg-slate-100 text-slate-700'
                            : 'text-slate-400'
                        }`}>
                          {r.type}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={r.status} />
                      </td>

                      {/* Remarks */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {r.remarks || (r.approved_by && r.approved_by !== '--' ? `Appr: ${r.approved_by}` : '--')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* ========================================================= */}
          {/* ✍️ OFFICIAL 3-TIER HR VERIFICATION & SIGNATURE BLOCK       */}
          {/* ========================================================= */}
          <div className="pt-8 border-t-2 border-slate-900/60 break-inside-avoid space-y-6">
            <div className="grid grid-cols-3 gap-6 text-center text-xs">
              {/* Tier 1: Prepared By */}
              <div className="space-y-1">
                <div className="h-10 flex items-end justify-center font-cursive text-slate-600">
                  <span className="text-[11px] italic font-mono">System Certified</span>
                </div>
                <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                  Prepared By (প্রস্তুতকারী)
                </div>
                <div className="text-[11px] text-slate-600 font-medium">HR Operations Assistant</div>
                <div className="text-[10px] text-slate-400">Date: ____________________</div>
              </div>

              {/* Tier 2: Verified By */}
              <div className="space-y-1">
                <div className="h-10 flex items-end justify-center"></div>
                <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                  Verified By (যাচাইকারী)
                </div>
                <div className="text-[11px] text-slate-600 font-medium">Field Operations Lead / Coordinator</div>
                <div className="text-[10px] text-slate-400">Date: ____________________</div>
              </div>

              {/* Tier 3: Approved By */}
              <div className="space-y-1">
                <div className="h-10 flex items-end justify-center"></div>
                <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                  Approved By (অনুমোদনকারী)
                </div>
                <div className="text-[11px] text-slate-600 font-medium">Head of Human Resources & Admin</div>
                <div className="text-[10px] text-slate-400">Date: ____________________</div>
              </div>
            </div>

            {/* Legal Compliance Footnote */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-[10px] text-slate-500 leading-relaxed print:border print:border-slate-300">
              <strong>OFFICIAL AUDIT & PAYROLL CERTIFICATION:</strong> This is an authentic system-generated document from FRA - Field Research Assistants.
              All timestamps and geolocation entries are recorded under strict server-side authority (Asia/Dhaka timezone).
              Officially compliant for HR payroll processing, statutory labor records, and corporate audit inspection.
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
