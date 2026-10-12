import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { DailyReportResponse } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Calendar,
  Search,
  Download,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Clock,
  CheckCircle2,
  FileText,
  Briefcase
} from 'lucide-react';

export const AdminDailyReport: React.FC = () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('');
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDailyReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DailyReportResponse>('/admin/reports/daily/', {
        params: {
          date: selectedDate,
          employee_type: employeeTypeFilter || undefined,
          status: statusFilter || undefined,
          attendance_type: typeFilter || undefined,
        }
      });
      setData(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyReport();
  }, [selectedDate, statusFilter, typeFilter, employeeTypeFilter]);

  const handleExport = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({
      date: selectedDate,
      format,
      ...(employeeTypeFilter && { employee_type: employeeTypeFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(typeFilter && { attendance_type: typeFilter }),
    });

    apiClient.get(`/admin/reports/daily/export/?${params.toString()}`, {
      responseType: 'blob',
    }).then((response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fra_daily_attendance_register_${selectedDate}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }).catch((err) => {
      alert('Export failed: ' + extractErrorMessage(err));
    });
  };

  const filteredRecords = data?.records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.employee_name.toLowerCase().includes(q) ||
      r.employee_id.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      (r.employee_type_display && r.employee_type_display.toLowerCase().includes(q))
    );
  }) || [];

  // Attendance rate computation
  const totalCount = data?.summary?.total_assistants || 0;
  const presentCount = (data?.summary?.present || 0) + (data?.summary?.late || 0);
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  // Format date nicely for official title
  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 print:p-0 print:m-0 print:max-w-none">
      {/* Print-specific style rules */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: landscape; margin: 10mm 8mm 12mm 8mm; }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body { background: white !important; color: #000000 !important; font-size: 10px; }
          .no-print { display: none !important; }
          .print-full { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .break-inside-avoid { page-break-inside: avoid; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td {
            position: static !important;
            color: #000000 !important;
          }
          .fa-name-text {
            color: #000000 !important;
            font-weight: 800 !important;
            font-size: 11px !important;
            display: block !important;
            white-space: normal !important;
          }
        }
      `}} />

      {/* Top Action Toolbar (Hidden during Print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900">Official HR Daily Report</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Authoritative Register
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Compliant attendance and working duration record for HR audit and payroll processing
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
            title="Download CSV format compatible with Microsoft Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 shadow-2xs transition-all cursor-pointer"
            title="Download professionally styled Excel workbook"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-2xs transition-all cursor-pointer"
            title="Print or save as official PDF document"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
          <button
            onClick={fetchDailyReport}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Hidden during Print) */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Attendance Date (হাজিরার তারিখ)
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Search Field Assistant
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by ID, name, department, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Employee Type
          </label>
          <div className="relative">
            <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <select
              value={employeeTypeFilter}
              onChange={(e) => setEmployeeTypeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">All Employee Types (সকল ধরন)</option>
              {activeEmployeeTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Status Filter
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses (সকল অবস্থা)</option>
            <option value="PRESENT">Present (উপস্থিত)</option>
            <option value="LATE">Late (বিলম্ব)</option>
            <option value="ON_LEAVE">On Leave (ছুটি)</option>
            <option value="HOLIDAY">Holiday (সরকারি ছুটি)</option>
            <option value="ABSENT">Absent (অনুপস্থিত)</option>
            <option value="INCOMPLETE">Incomplete / Active</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Attendance Type
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Verification Types</option>
            <option value="AUTOMATIC">AUTOMATIC (Mobile Server Time)</option>
            <option value="MANUAL">MANUAL (Admin Approved Correction)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="no-print p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 📄 OFFICIAL HR PRINTABLE DOCUMENT CONTAINER               */}
      {/* ========================================================= */}
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
            Official Daily Attendance & Duty Register (দৈনিক কর্মকর্তা-কর্মচারী উপস্থিতি বিবরণী)
          </div>

          {/* Official Document Metadata Box */}
          <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200 print:bg-transparent print:border print:border-slate-300">
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Report Date:</span>
              <strong className="text-slate-900 font-mono">{selectedDate}</strong>
              <div className="text-[11px] text-slate-500 font-medium">{formattedDate}</div>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Reference Code:</span>
              <span className="font-mono font-bold text-slate-800">FRA-DTR-{selectedDate.replace(/-/g, '')}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Timezone Standard:</span>
              <span className="font-semibold text-slate-800">Asia/Dhaka (UTC+06:00)</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">HR Authority:</span>
              <span className="font-semibold text-emerald-800">Server-Side Verified</span>
            </div>
          </div>
        </div>

        {/* Executive HR KPI Statistics Strip */}
        {data?.summary && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 print:grid-cols-8">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="text-[10px] uppercase font-bold text-slate-500">Total Staff</div>
              <div className="text-base font-black font-mono text-slate-900">{data.summary.total_assistants}</div>
            </div>
            <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200 text-center">
              <div className="text-[10px] uppercase font-bold text-emerald-800">Present</div>
              <div className="text-base font-black font-mono text-emerald-800">{data.summary.present}</div>
            </div>
            <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200 text-center">
              <div className="text-[10px] uppercase font-bold text-amber-800">Late</div>
              <div className="text-base font-black font-mono text-amber-800">{data.summary.late}</div>
            </div>
            <div className="p-2.5 bg-cyan-50/70 rounded-xl border border-cyan-200 text-center">
              <div className="text-[10px] uppercase font-bold text-cyan-800">Shift Done</div>
              <div className="text-base font-black font-mono text-cyan-800">{data.summary.checked_out}</div>
            </div>
            <div className="p-2.5 bg-violet-50/70 rounded-xl border border-violet-200 text-center">
              <div className="text-[10px] uppercase font-bold text-violet-800">On Leave</div>
              <div className="text-base font-black font-mono text-violet-800">{data.summary.on_leave || 0}</div>
            </div>
            <div className="p-2.5 bg-sky-50/70 rounded-xl border border-sky-200 text-center">
              <div className="text-[10px] uppercase font-bold text-sky-800">Holiday</div>
              <div className="text-base font-black font-mono text-sky-800">{data.summary.holiday || 0}</div>
            </div>
            <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200 text-center">
              <div className="text-[10px] uppercase font-bold text-rose-800">Absent</div>
              <div className="text-base font-black font-mono text-rose-800">{data.summary.absent}</div>
            </div>
            <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200 text-center">
              <div className="text-[10px] uppercase font-bold text-blue-800">Attn. Rate</div>
              <div className="text-base font-black font-mono text-blue-900">{attendanceRate}%</div>
            </div>
          </div>
        )}

        {/* Main Attendance Register Table */}
        <div className="overflow-x-auto print:overflow-visible">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No attendance records found matching this date or filter.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-left border border-slate-200 print:text-[10px]">
              <thead className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider print:bg-slate-100 print:text-black">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3">Field Assistant</th>
                  <th className="py-2.5 px-3">Department / Employee Type</th>
                  <th className="py-2.5 px-3">Check In & Location</th>
                  <th className="py-2.5 px-3">Check Out & Location</th>
                  <th className="py-2.5 px-3 text-center">Duration</th>
                  <th className="py-2.5 px-2 text-center">Type</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-2 text-center">Approval</th>
                  <th className="py-2.5 px-3">HR Remarks / Approver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredRecords.map((r, idx) => (
                  <tr key={r.employee_id} className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold">
                      {idx + 1}
                    </td>

                    {/* Employee Profile */}
                    <td className="py-2.5 px-3 print:text-black">
                      <div className="font-bold text-slate-900 text-sm fa-name-text print:text-black print:font-black print:text-[11px] print:whitespace-normal">
                        {r.employee_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono print:text-slate-800 print:text-[9px]">
                        <span className="font-bold print:text-black">{r.employee_id}</span>
                        <span> • </span>
                        <span>{r.designation}</span>
                      </div>
                    </td>

                    {/* Department & Employee Type */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{r.department}</div>
                      <div className="text-[11px] text-slate-500">{r.employee_type_display || r.employee_type}</div>
                    </td>

                    {/* Check In */}
                    <td className="py-2.5 px-3">
                      {r.check_in !== '--' ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-slate-900">{r.check_in}</div>
                          {r.check_in_address && (
                            <div className="text-[10px] text-slate-600 leading-tight">
                              {r.check_in_address}
                            </div>
                          )}
                          {r.check_in_latitude && r.check_in_longitude && (
                            <div className="text-[10px] text-blue-700 font-mono">
                              GPS: {r.check_in_latitude.toFixed(4)}, {r.check_in_longitude.toFixed(4)}
                              {r.check_in_accuracy ? ` (±${r.check_in_accuracy}m)` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono">--</span>
                      )}
                    </td>

                    {/* Check Out */}
                    <td className="py-2.5 px-3">
                      {r.check_out !== '--' ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-slate-900">{r.check_out}</div>
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
                          Active On Site
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">--</span>
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

                    {/* Admin sign-off */}
                    <td className="py-2.5 px-2 text-center">
                      {r.approval_status ? (
                        <StatusBadge status={r.approval_status} />
                      ) : (
                        <span className="text-[10px] text-slate-400">No record</span>
                      )}
                    </td>

                    {/* Remarks / Approver */}
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {r.remarks || (r.approved_by !== '--' ? `Appr: ${r.approved_by}` : '--')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
    </div>
  );
};
