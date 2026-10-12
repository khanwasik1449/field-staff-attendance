import React, { useState, useEffect, useMemo } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { useEmployeeTypes } from '../../hooks/useEmployeeTypes';
import { MonthlyReportResponse, MonthlyReportRecord, DailyAttendanceItem, DayMetadata } from '../../types';
import {
  Calendar,
  Search,
  Download,
  FileSpreadsheet,
  Printer,
  Clock,
  Award,
  RefreshCw,
  AlertCircle,
  FileText,
  Users,
  Grid,
  BarChart3,
  X,
  MapPin,
  CheckCircle2,
  Info,
  ChevronRight,
  Filter,
  Briefcase
} from 'lucide-react';

export const AdminMonthlyReport: React.FC = () => {
  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const { activeTypes: activeEmployeeTypes } = useEmployeeTypes();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [search, setSearch] = useState('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'summary' | 'daywise'>('summary');
  const [data, setData] = useState<MonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown states
  const [selectedCell, setSelectedCell] = useState<{ record: MonthlyReportRecord; day: DailyAttendanceItem } | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const fetchMonthlyReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<MonthlyReportResponse>('/admin/reports/monthly/', {
        params: { year, month, employee_type: employeeTypeFilter || undefined }
      });
      setData(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyReport();
  }, [month, year, employeeTypeFilter]);

  const handleExport = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({
      year: year.toString(),
      month: month.toString(),
      format,
      view_type: viewMode,
      ...(employeeTypeFilter && { employee_type: employeeTypeFilter }),
    });

    const prefix = viewMode === 'daywise' ? 'fra_monthly_attendance_muster_roll' : 'fra_monthly_attendance_summary';
    apiClient.get(`/admin/reports/monthly/export/?${params.toString()}`, {
      responseType: 'blob',
    }).then((response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${prefix}_${year}_${month < 10 ? '0' + month : month}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }).catch((err) => {
      alert('Export failed: ' + extractErrorMessage(err));
    });
  };

  const filteredRecords = useMemo(() => {
    return (data?.records || []).filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.employee_name.toLowerCase().includes(q) ||
        r.employee_id.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        (r.employee_type_display && r.employee_type_display.toLowerCase().includes(q))
      );
    });
  }, [data, search]);

  // Monthly totals across all employees
  const totals = useMemo(() => {
    const records = data?.records || [];
    let totalPresent = 0;
    let totalLate = 0;
    let totalLeave = 0;
    let totalHoliday = 0;
    let totalWeekend = 0;
    let totalAbsent = 0;
    let totalManual = 0;

    records.forEach((r) => {
      totalPresent += r.present_days || 0;
      totalLate += r.late_days || 0;
      totalLeave += r.leave_days || 0;
      totalHoliday += r.holiday_days || 0;
      totalWeekend += r.weekend_days || 0;
      totalAbsent += r.absent_days || 0;
      totalManual += r.manual_days || 0;
    });

    const totalDaysLogged = totalPresent + totalLate + totalAbsent + totalLeave + totalHoliday;
    const avgAttendance = totalDaysLogged > 0 ? Math.round(((totalPresent + totalLate) / totalDaysLogged) * 100) : 0;

    return {
      totalStaff: records.length,
      totalPresent,
      totalLate,
      totalLeave,
      totalHoliday,
      totalWeekend,
      totalAbsent,
      totalManual,
      avgAttendance,
    };
  }, [data]);

  // Day breakdown data for selectedDay modal
  const dayBreakdown = useMemo(() => {
    if (selectedDay === null || !data) return null;
    const dayMeta = data.days_metadata?.find((dm) => dm.day === selectedDay);
    const dayRecords: { record: MonthlyReportRecord; dayItem: DailyAttendanceItem }[] = [];

    data.records.forEach((r) => {
      const dayItem = r.days?.find((d) => d.day === selectedDay);
      if (dayItem) {
        dayRecords.push({ record: r, dayItem });
      }
    });

    let pCount = 0, lCount = 0, lvCount = 0, hCount = 0, wCount = 0, aCount = 0, mCount = 0;
    dayRecords.forEach(({ dayItem }) => {
      if (dayItem.code === 'P') pCount++;
      else if (dayItem.code === 'L') lCount++;
      else if (dayItem.code === 'M') { mCount++; pCount++; }
      else if (dayItem.code === 'LV') lvCount++;
      else if (dayItem.code === 'H') hCount++;
      else if (dayItem.code === 'W') wCount++;
      else if (dayItem.code === 'A') aCount++;
    });

    return {
      dayMeta,
      records: dayRecords,
      stats: { pCount, lCount, mCount, lvCount, hCount, wCount, aCount, total: dayRecords.length }
    };
  }, [selectedDay, data]);

  const getCodeBadgeClass = (code: string) => {
    switch (code) {
      case 'P':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200';
      case 'L':
        return 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200';
      case 'M':
        return 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200';
      case 'LV':
        return 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200';
      case 'H':
        return 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200';
      case 'W':
        return 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200';
      case 'A':
        return 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200';
      default:
        return 'text-slate-300 font-mono';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 print:p-0 print:m-0 print:max-w-none">
      {/* Print-specific style rules */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: landscape;
            margin: 8mm 6mm 10mm 6mm;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: white !important;
            color: #000000 !important;
            font-size: 9px !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .break-inside-avoid {
            page-break-inside: avoid;
          }

          /* Force all table headers and cells to be static in print (fixes sticky overlapping/hiding bug) */
          table {
            width: 100% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
          }
          th, td {
            position: static !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            z-index: auto !important;
            box-shadow: none !important;
            color: #000000 !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
          }

          /* Explicit rule to ensure Field Assistant column and name are always visible and solid black */
          .fa-name-col {
            width: 155px !important;
            min-width: 135px !important;
            max-width: 175px !important;
            position: static !important;
            left: auto !important;
            display: table-cell !important;
            visibility: visible !important;
            background: #ffffff !important;
          }
          .fa-name-text {
            display: block !important;
            visibility: visible !important;
            color: #000000 !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            white-space: normal !important;
            word-break: break-word !important;
          }
          .fa-sub-text {
            display: block !important;
            visibility: visible !important;
            color: #334155 !important;
            font-size: 8px !important;
            white-space: normal !important;
            word-break: break-word !important;
          }
          .day-col-header {
            min-width: 0 !important;
            width: auto !important;
            padding: 2px 1px !important;
            font-size: 8px !important;
          }
          .day-col-cell {
            padding: 2px 0.5px !important;
            font-size: 8px !important;
          }
          .day-badge {
            width: 100% !important;
            height: auto !important;
            line-height: 1.2 !important;
            padding: 1px 0 !important;
            font-size: 7.5px !important;
            border: none !important;
          }
        }
      `}} />

      {/* Top Action Toolbar (Hidden during Print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900">Official Monthly Attendance Report</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                Monthly HR Audit
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Aggregated monthly duty hours, punctuality metrics, and day-wise attendance muster roll
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'summary'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="View aggregated monthly summary table"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Summary</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('daywise')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'daywise'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="View day-by-day attendance sheet for all participants"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Day-wise (Muster Roll)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                viewMode === 'daywise' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800'
              }`}>
                {data?.total_days || 31}d
              </span>
            </button>
          </div>

          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
            title={`Download CSV file (${viewMode === 'daywise' ? 'Day-wise Muster Roll' : 'Monthly Summary'})`}
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV {viewMode === 'daywise' ? '(Day-wise)' : ''}</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 shadow-2xs transition-all cursor-pointer"
            title={`Download Excel workbook (${viewMode === 'daywise' ? 'Day-wise Muster Roll' : 'Monthly Summary'})`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-2xs transition-all cursor-pointer"
            title="Print or save as official PDF document"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print PDF</span>
          </button>
          <button
            onClick={fetchMonthlyReport}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toolbar: Month Picker & Search (Hidden during Print) */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Period:</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            {monthNames.map((m, idx) => (
              <option key={idx + 1} value={idx + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-slate-400" />
          <select
            value={employeeTypeFilter}
            onChange={(e) => setEmployeeTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            <option value="">All Employee Types</option>
            {activeEmployeeTypes.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search assistant by name, ID, dept, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
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
            {viewMode === 'daywise'
              ? `Official Day-wise Attendance Muster Roll (মাসিক দৈনিক উপস্থিতি মাস্টার রোল - ${monthNames[month - 1]} ${year})`
              : `Official Monthly Attendance & Working Hours Register (মাসিক উপস্থিতি ও কর্মঘণ্টা বিবরণী - ${monthNames[month - 1]} ${year})`}
          </div>

          {/* Official Document Metadata Box */}
          <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200 print:bg-transparent print:border print:border-slate-300">
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Monthly Period:</span>
              <strong className="text-slate-900 font-mono text-sm">{monthNames[month - 1]} {year}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Reference Code:</span>
              <span className="font-mono font-bold text-slate-800">
                FRA-{viewMode === 'daywise' ? 'MUSTER' : 'MAR'}-{year}{month < 10 ? '0' + month : month}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">Timezone Standard:</span>
              <span className="font-semibold text-slate-800">Asia/Dhaka (UTC+06:00)</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase text-[10px]">HR Authority:</span>
              <span className="font-semibold text-teal-800">Server-Side Verified Register</span>
            </div>
          </div>
        </div>

        {/* Monthly Summary Statistics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 print:grid-cols-8">
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <div className="text-[10px] uppercase font-bold text-slate-500">Total Staff</div>
            <div className="text-base font-black font-mono text-slate-900">{totals.totalStaff}</div>
          </div>
          <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200 text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-800">Present Days</div>
            <div className="text-base font-black font-mono text-emerald-800">{totals.totalPresent}</div>
          </div>
          <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200 text-center">
            <div className="text-[10px] uppercase font-bold text-amber-800">Late Days</div>
            <div className="text-base font-black font-mono text-amber-800">{totals.totalLate}</div>
          </div>
          <div className="p-2.5 bg-violet-50/70 rounded-xl border border-violet-200 text-center">
            <div className="text-[10px] uppercase font-bold text-violet-800">Leave Days</div>
            <div className="text-base font-black font-mono text-violet-800">{totals.totalLeave}</div>
          </div>
          <div className="p-2.5 bg-sky-50/70 rounded-xl border border-sky-200 text-center">
            <div className="text-[10px] uppercase font-bold text-sky-800">Holidays</div>
            <div className="text-base font-black font-mono text-sky-800">{totals.totalHoliday}</div>
          </div>
          <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200 text-center">
            <div className="text-[10px] uppercase font-bold text-rose-800">Absent Days</div>
            <div className="text-base font-black font-mono text-rose-800">{totals.totalAbsent}</div>
          </div>
          <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200 text-center">
            <div className="text-[10px] uppercase font-bold text-blue-800">Manual Days</div>
            <div className="text-base font-black font-mono text-blue-800">{totals.totalManual}</div>
          </div>
          <div className="p-2.5 bg-teal-50/70 rounded-xl border border-teal-200 text-center">
            <div className="text-[10px] uppercase font-bold text-teal-800">Attn. Rate</div>
            <div className="text-base font-black font-mono text-teal-900">{totals.avgAttendance}%</div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* VIEW 1: DAY-WISE ATTENDANCE MUSTER ROLL MATRIX            */}
        {/* ========================================================= */}
        {viewMode === 'daywise' && (
          <div className="space-y-4">
            {/* Legend Bar */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Status Legend:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  P
                  <span className="font-normal text-emerald-700 text-[10px]">Present</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-300">
                  L
                  <span className="font-normal text-amber-700 text-[10px]">Late</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold border border-blue-300">
                  M
                  <span className="font-normal text-blue-700 text-[10px]">Manual</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold border border-purple-300">
                  LV
                  <span className="font-normal text-purple-700 text-[10px]">Leave</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-bold border border-sky-300">
                  H
                  <span className="font-normal text-sky-700 text-[10px]">Holiday</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold border border-slate-300">
                  W
                  <span className="font-normal text-slate-500 text-[10px]">Weekend</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold border border-rose-300">
                  A
                  <span className="font-normal text-rose-700 text-[10px]">Absent</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 italic">
                * Click any cell or date column header to inspect exact timestamps & GPS coordinates
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto print:overflow-visible rounded-2xl border border-slate-200">
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">
                  No attendance records found for {monthNames[month - 1]} {year}.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-left border-collapse text-[11px] print:text-[9px]">
                  <thead className="bg-slate-900 text-white font-bold tracking-wider print:bg-slate-100 print:text-black">
                    <tr>
                      <th className="py-2.5 px-2 text-center w-8 sticky left-0 z-20 bg-slate-900 print:static print:left-auto print:bg-slate-100 print:text-black">#</th>
                      <th className="py-2.5 px-3 w-48 sticky left-8 z-20 bg-slate-900 print:static print:left-auto print:bg-slate-100 print:text-black fa-name-col border-r border-slate-700 print:border-slate-300">
                        Field Assistant
                      </th>
                      {data?.days_metadata?.map((dm) => (
                        <th
                          key={dm.day}
                          onClick={() => setSelectedDay(dm.day)}
                          className={`py-2 px-1 text-center min-w-[28px] day-col-header cursor-pointer transition-colors border-r border-slate-700/60 print:border-slate-300 hover:bg-teal-800 ${
                            dm.is_weekend
                              ? 'bg-slate-800 text-slate-300'
                              : dm.is_holiday
                              ? 'bg-sky-900 text-sky-200'
                              : ''
                          }`}
                          title={`${dm.date} (${dm.weekday})${dm.holiday_name ? ' - ' + dm.holiday_name : dm.is_weekend ? ' - Weekly Off' : ''}. Click to view daily breakdown of all participants.`}
                        >
                          <div className="font-mono font-black text-[11px]">{dm.day}</div>
                          <div className={`text-[8.5px] uppercase ${dm.is_weekend ? 'text-amber-300' : 'text-slate-400'}`}>
                            {dm.weekday.slice(0, 2)}
                          </div>
                        </th>
                      ))}
                      <th className="py-2.5 px-2 text-center text-emerald-300 print:text-emerald-800 border-l border-slate-700">P</th>
                      <th className="py-2.5 px-2 text-center text-amber-300 print:text-amber-800">L</th>
                      <th className="py-2.5 px-2 text-center text-purple-300 print:text-purple-800">LV</th>
                      <th className="py-2.5 px-2 text-center text-sky-300 print:text-sky-800">H</th>
                      <th className="py-2.5 px-2 text-center text-slate-300 print:text-slate-600">W</th>
                      <th className="py-2.5 px-2 text-center text-rose-300 print:text-rose-800">A</th>
                      <th className="py-2.5 px-3 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredRecords.map((r, idx) => (
                      <tr key={r.employee_id} className={`hover:bg-teal-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                        <td className="py-2 px-2 text-center font-mono font-semibold text-slate-500 sticky left-0 z-10 bg-inherit print:static print:left-auto print:bg-transparent print:text-black">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 sticky left-8 z-10 bg-white fa-name-col print:static print:left-auto print:bg-transparent border-r border-slate-200 print:border-slate-300">
                          <div className="font-black text-slate-900 text-xs whitespace-nowrap fa-name-text print:text-black print:font-black print:text-[10px] print:whitespace-normal print:break-words">
                            {r.employee_name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 fa-sub-text print:text-slate-800 print:text-[8px] print:whitespace-normal">
                            <span className="font-bold print:text-black">{r.employee_id}</span>
                            <span>•</span>
                            <span className="truncate max-w-[120px] print:max-w-none print:overflow-visible">{r.employee_type_display || r.department}</span>
                          </div>
                        </td>

                        {/* Day Cells 1..N */}
                        {r.days?.map((d) => (
                          <td
                            key={d.day}
                            onClick={() => setSelectedCell({ record: r, day: d })}
                            className={`py-1.5 px-0.5 day-col-cell text-center border-r border-slate-100 cursor-pointer transition-transform hover:scale-110 ${
                              d.status === 'WEEKEND' ? 'bg-slate-50/80' : ''
                            }`}
                            title={`${d.date} (${d.weekday}) - ${r.employee_name}: ${d.label}${d.check_in !== '--' ? ` | In: ${d.check_in} Out: ${d.check_out} (${d.duration})` : ''}`}
                          >
                            <span
                              className={`inline-block w-6 h-6 leading-6 day-badge text-center rounded-md text-[10px] font-black border transition-all ${getCodeBadgeClass(d.code)}`}
                            >
                              {d.code}
                            </span>
                          </td>
                        ))}

                        {/* Summary Columns */}
                        <td className="py-2 px-2 text-center font-black font-mono text-emerald-700 bg-emerald-50/30 border-l border-slate-200">
                          {r.present_days}
                        </td>
                        <td className="py-2 px-2 text-center font-bold font-mono text-amber-700 bg-amber-50/30">
                          {r.late_days}
                        </td>
                        <td className="py-2 px-2 text-center font-bold font-mono text-purple-700 bg-purple-50/30">
                          {r.leave_days || 0}
                        </td>
                        <td className="py-2 px-2 text-center font-bold font-mono text-sky-700 bg-sky-50/30">
                          {r.holiday_days || 0}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold font-mono text-slate-600 bg-slate-50/50">
                          {r.weekend_days || 0}
                        </td>
                        <td className="py-2 px-2 text-center font-black font-mono text-rose-700 bg-rose-50/30">
                          {r.absent_days}
                        </td>
                        <td className="py-2 px-3 text-right font-black font-mono text-slate-900 whitespace-nowrap">
                          {r.total_working_hours}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: STANDARD MONTHLY SUMMARY TABLE                    */}
        {/* ========================================================= */}
        {viewMode === 'summary' && (
          <div className="overflow-x-auto print:overflow-visible">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No monthly attendance records found for {monthNames[month - 1]} {year}.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left border border-slate-200 print:text-[10px]">
                <thead className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider print:bg-slate-100 print:text-black">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">#</th>
                    <th className="py-2.5 px-4 fa-name-col print:text-black">Field Assistant</th>
                    <th className="py-2.5 px-4">Department & Employee Type</th>
                    <th className="py-2.5 px-3 text-center text-emerald-300 print:text-emerald-800">Present</th>
                    <th className="py-2.5 px-3 text-center text-amber-300 print:text-amber-800">Late</th>
                    <th className="py-2.5 px-3 text-center text-violet-300 print:text-violet-800">Leave</th>
                    <th className="py-2.5 px-3 text-center text-sky-300 print:text-sky-800">Holiday</th>
                    <th className="py-2.5 px-3 text-center text-slate-300 print:text-slate-600">Weekend</th>
                    <th className="py-2.5 px-3 text-center text-rose-300 print:text-rose-800">Absent</th>
                    <th className="py-2.5 px-3 text-center text-blue-300 print:text-blue-800">Manual</th>
                    <th className="py-2.5 px-4 text-right">Total Working Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredRecords.map((r, idx) => (
                    <tr key={r.employee_id} className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold print:text-black">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 fa-name-col print:text-black">
                        <div className="font-black text-slate-900 text-sm fa-name-text print:text-black print:font-black print:text-[11px] print:whitespace-normal print:break-words">
                          {r.employee_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono fa-sub-text print:text-slate-800 print:text-[9px]">
                          <span className="font-bold print:text-black">{r.employee_id}</span>
                          <span> • </span>
                          <span>{r.designation}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-800">{r.department}</div>
                        <div className="text-[11px] text-slate-500">{r.employee_type_display || r.employee_type}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black font-mono text-emerald-700 bg-emerald-50/40">
                        {r.present_days}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-amber-700 bg-amber-50/40">
                        {r.late_days}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-violet-700 bg-violet-50/40">
                        {r.leave_days || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-sky-700 bg-sky-50/40">
                        {r.holiday_days || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold font-mono text-slate-600 bg-slate-50/50">
                        {r.weekend_days || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center font-black font-mono text-rose-700 bg-rose-50/40">
                        {r.absent_days}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-blue-700 bg-blue-50/40">
                        {r.manual_days}
                      </td>
                      <td className="py-2.5 px-4 text-right font-black font-mono text-slate-900 text-sm">
                        {r.total_working_hours}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

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

      {/* ========================================================= */}
      {/* 🔍 MODAL 1: SINGLE CELL ATTENDANCE DETAIL POPUP          */}
      {/* ========================================================= */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div>
                <h3 className="text-base font-black">Daily Punch Details</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedCell.day.date} ({selectedCell.day.weekday})
                </p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Employee Header */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <div className="text-sm font-black text-slate-900">{selectedCell.record.employee_name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {selectedCell.record.employee_id} • {selectedCell.record.designation}
                  </div>
                  <div className="text-xs text-teal-800 font-medium mt-0.5">
                    {selectedCell.record.employee_type_display || selectedCell.record.department}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black border ${getCodeBadgeClass(selectedCell.day.code)}`}>
                    {selectedCell.day.label}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">Code: {selectedCell.day.code}</div>
                </div>
              </div>

              {/* Timing Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">Check-In Time</span>
                  <strong className="text-sm font-black font-mono text-emerald-950 block mt-0.5">
                    {selectedCell.day.check_in}
                  </strong>
                  {selectedCell.day.check_in_address && (
                    <div className="text-[11px] text-emerald-900 mt-1 flex items-start gap-1">
                      <MapPin className="w-3 h-3 text-emerald-700 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{selectedCell.day.check_in_address}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-blue-800 block">Check-Out Time</span>
                  <strong className="text-sm font-black font-mono text-blue-950 block mt-0.5">
                    {selectedCell.day.check_out}
                  </strong>
                  {selectedCell.day.check_out_address && (
                    <div className="text-[11px] text-blue-900 mt-1 flex items-start gap-1">
                      <MapPin className="w-3 h-3 text-blue-700 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{selectedCell.day.check_out_address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Duration and Type */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Working Duration:</span>
                  <strong className="text-slate-900 font-mono text-sm">{selectedCell.day.duration}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Attendance Method:</span>
                  <span className="font-semibold text-slate-800">{selectedCell.day.type}</span>
                </div>
              </div>

              {/* Remarks / Log Note */}
              {selectedCell.day.remarks && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-800 flex items-center gap-1">
                    <Info className="w-3 h-3 text-amber-700" />
                    Log Remarks & Audit Note:
                  </span>
                  <p className="text-amber-950 font-medium">{selectedCell.day.remarks}</p>
                </div>
              )}

              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 📅 MODAL 2: FULL DAY BREAKDOWN (ALL PARTICIPANTS)         */}
      {/* ========================================================= */}
      {dayBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white font-black font-mono">
                  {selectedDay}
                </div>
                <div>
                  <h3 className="text-base font-black">
                    Daily Attendance Breakdown: {monthNames[month - 1]} {selectedDay}, {year}
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>{dayBreakdown.dayMeta?.weekday}</span>
                    {dayBreakdown.dayMeta?.is_holiday && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-sky-900 text-sky-200">
                        {dayBreakdown.dayMeta.holiday_name}
                      </span>
                    )}
                    {dayBreakdown.dayMeta?.is_weekend && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                        Weekly Off (Friday)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metrics Bar for the day */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 grid grid-cols-3 sm:grid-cols-7 gap-2 text-center text-xs">
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Staff</div>
                <div className="text-sm font-black text-slate-900 font-mono">{dayBreakdown.stats.total}</div>
              </div>
              <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-[10px] text-emerald-700 font-bold uppercase">Present</div>
                <div className="text-sm font-black text-emerald-800 font-mono">{dayBreakdown.stats.pCount}</div>
              </div>
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
                <div className="text-[10px] text-amber-700 font-bold uppercase">Late</div>
                <div className="text-sm font-black text-amber-800 font-mono">{dayBreakdown.stats.lCount}</div>
              </div>
              <div className="p-2 bg-purple-50 rounded-xl border border-purple-200">
                <div className="text-[10px] text-purple-700 font-bold uppercase">Leave</div>
                <div className="text-sm font-black text-purple-800 font-mono">{dayBreakdown.stats.lvCount}</div>
              </div>
              <div className="p-2 bg-sky-50 rounded-xl border border-sky-200">
                <div className="text-[10px] text-sky-700 font-bold uppercase">Holiday</div>
                <div className="text-sm font-black text-sky-800 font-mono">{dayBreakdown.stats.hCount}</div>
              </div>
              <div className="p-2 bg-slate-100 rounded-xl border border-slate-300">
                <div className="text-[10px] text-slate-600 font-bold uppercase">Weekend</div>
                <div className="text-sm font-black text-slate-700 font-mono">{dayBreakdown.stats.wCount}</div>
              </div>
              <div className="p-2 bg-rose-50 rounded-xl border border-rose-200">
                <div className="text-[10px] text-rose-700 font-bold uppercase">Absent</div>
                <div className="text-sm font-black text-rose-800 font-mono">{dayBreakdown.stats.aCount}</div>
              </div>
            </div>

            {/* Participant Day Table */}
            <div className="overflow-y-auto p-4 flex-1">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Field Assistant</th>
                    <th className="py-2.5 px-3">Employee Type</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Check-In</th>
                    <th className="py-2.5 px-3">Check-Out</th>
                    <th className="py-2.5 px-3 text-center">Duration</th>
                    <th className="py-2.5 px-3">Remarks / Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dayBreakdown.records.map(({ record, dayItem }) => (
                    <tr key={record.employee_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{record.employee_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{record.employee_id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {record.employee_type_display || record.department}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${getCodeBadgeClass(dayItem.code)}`}>
                          {dayItem.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {dayItem.check_in}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {dayItem.check_out}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        {dayItem.duration}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={dayItem.check_in_address || dayItem.remarks}>
                        {dayItem.check_in_address || dayItem.remarks || '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Day View
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
