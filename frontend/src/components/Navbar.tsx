import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  LogOut,
  Calendar,
  FileText,
  Users,
  Settings,
  Shield,
  Menu,
  X,
  FileSpreadsheet,
  CalendarDays,
  Briefcase,
  ChevronDown,
  LayoutDashboard,
  HelpCircle,
  UploadCloud,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, employee, isAdmin, isFieldAssistant, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateDhakaTime = () => {
      // Dhaka is UTC+6
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      setCurrentTime(now.toLocaleTimeString('en-US', options));
    };

    updateDhakaTime();
    const interval = setInterval(updateDhakaTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Close dropdown when route or search changes
  useEffect(() => {
    setActiveDropdown(null);
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;

  const isDashboardActive = location.pathname === '/admin';
  const isOperationsActive =
    location.pathname.startsWith('/admin/employees') ||
    location.pathname.startsWith('/admin/accounts') ||
    location.pathname.startsWith('/admin/employee-types');
  const isReportsActive =
    location.pathname.startsWith('/admin/daily') ||
    location.pathname.startsWith('/admin/monthly') ||
    location.pathname.startsWith('/admin/employee-report');
  const isApprovalsActive =
    location.pathname.startsWith('/admin/attendance-approvals') ||
    location.pathname.startsWith('/admin/manual-requests') ||
    location.pathname.startsWith('/admin/leaves');
  const isSystemActive =
    location.pathname.startsWith('/admin/audit-logs') ||
    location.pathname.startsWith('/admin/settings');

  const toggleDropdown = (name: string) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  };

  return (
    <nav className="bg-slate-900 text-white sticky top-0 z-50 shadow-md no-print print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link
              to={isAdmin ? "/admin" : "/assistant"}
              className="flex items-center gap-2.5 font-bold text-lg tracking-tight hover:text-emerald-400 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-xs shadow-sm">
                FRA
              </div>
              <div className="flex flex-col">
                <span className="leading-tight font-black">FRA</span>
                <span className="text-[10px] text-slate-400 font-medium leading-none">Field Research Assistants</span>
              </div>
            </Link>

            {/* Official Dhaka Time Display */}
            <div className="hidden sm:flex items-center gap-1.5 ml-3 px-3 py-1 rounded-full bg-slate-800/90 text-xs text-slate-300 border border-slate-700/80">
              <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Dhaka: <strong className="text-emerald-400 font-mono">{currentTime || '--:--:--'}</strong></span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            {/* Field Assistant Navigation */}
            {isFieldAssistant && (
              <>
                <Link
                  to="/assistant"
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive('/assistant') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  Today's Attendance
                </Link>
                <Link
                  to="/assistant/history"
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive('/assistant/history') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  My History
                </Link>
                <Link
                  to="/assistant/requests"
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive('/assistant/requests') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  Manual Requests
                </Link>
                <Link
                  to="/assistant/leaves"
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive('/assistant/leaves') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  Leaves
                </Link>
              </>
            )}

            {/* Central Admin Consolidated Dropdown Navigation */}
            {isAdmin && (
              <div ref={dropdownRef} className="flex items-center gap-1.5">
                {/* 1. Dashboard Direct Link */}
                <Link
                  to="/admin"
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                    isDashboardActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                  <span>Dashboard</span>
                </Link>

                {/* 2. Operations Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('operations')}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isOperationsActive
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    <span>Operations</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'operations' ? 'rotate-180 text-emerald-400' : 'text-slate-400'}`} />
                  </button>

                  {activeDropdown === 'operations' && (
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1">
                        Workforce Management
                      </div>
                      <Link
                        to="/admin/employees"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/employees' && !location.search.includes('action=bulk-upload') ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <Users className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Field Assistants & Accounts</div>
                          <div className="text-xs text-slate-400">Manage FA credentials and assignments</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/employees?action=bulk-upload"
                        onClick={() => setActiveDropdown(null)}
                        className="flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors text-slate-200"
                      >
                        <UploadCloud className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Bulk Upload FAs</div>
                          <div className="text-xs text-slate-400">Import assistants via Excel or CSV</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/employee-types"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/employee-types' ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <Briefcase className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Employee Types</div>
                          <div className="text-xs text-slate-400">Manage staff classifications</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* 3. Reports Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('reports')}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isReportsActive
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Reports</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'reports' ? 'rotate-180 text-emerald-400' : 'text-slate-400'}`} />
                  </button>

                  {activeDropdown === 'reports' && (
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1">
                        Attendance Reporting
                      </div>
                      <Link
                        to="/admin/daily"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/daily' ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <FileSpreadsheet className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Daily Attendance Report</div>
                          <div className="text-xs text-slate-400">Live roster, GPS locations & CSV export</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/monthly"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/monthly' ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <Calendar className="w-4 h-4 mt-0.5 text-teal-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Monthly Summary Matrix</div>
                          <div className="text-xs text-slate-400">Total days, hours, late & absent ratios</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/employee-report"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/employee-report' ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <FileText className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Individual Employee Report</div>
                          <div className="text-xs text-slate-400">Detailed per-assistant attendance history</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* 4. Approvals Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('approvals')}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isApprovalsActive
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>Approvals</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'approvals' ? 'rotate-180 text-emerald-400' : 'text-slate-400'}`} />
                  </button>

                  {activeDropdown === 'approvals' && (
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1">
                        Daily Attendance
                      </div>
                      <Link
                        to="/admin/attendance-approvals"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/attendance-approvals' ? 'bg-slate-800/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Daily Attendance</div>
                          <div className="text-xs text-slate-400">Approve each day's attendance before payroll</div>
                        </div>
                      </Link>
                      <div className="px-3.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1 mt-1">
                        Requests & Leaves
                      </div>
                      <Link
                        to="/admin/manual-requests"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/manual-requests' ? 'bg-slate-800/80 text-amber-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <HelpCircle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Manual Punch Requests</div>
                          <div className="text-xs text-slate-400">Review & approve missed punches</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/leaves"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/leaves' ? 'bg-slate-800/80 text-rose-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <CalendarDays className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Leaves & Holidays</div>
                          <div className="text-xs text-slate-400">Manage leave approvals & holiday calendar</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* 5. System Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('system')}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSystemActive
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <Settings className="w-4 h-4 text-purple-400" />
                    <span>System</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'system' ? 'rotate-180 text-emerald-400' : 'text-slate-400'}`} />
                  </button>

                  {activeDropdown === 'system' && (
                    <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1">
                        Configuration & Security
                      </div>
                      <Link
                        to="/admin/audit-logs"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/audit-logs' ? 'bg-slate-800/80 text-purple-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <Shield className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Audit Logs & Trail</div>
                          <div className="text-xs text-slate-400">Immutable security & change logs</div>
                        </div>
                      </Link>
                      <Link
                        to="/admin/settings"
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors ${
                          location.pathname === '/admin/settings' ? 'bg-slate-800/80 text-indigo-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <Settings className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Platform Settings</div>
                          <div className="text-xs text-slate-400">Working hours, grace time & policies</div>
                        </div>
                      </Link>
                      <div className="border-t border-slate-800/80 my-1"></div>
                      <a
                        href="/django-admin/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 px-3.5 py-2 hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                      >
                        <ExternalLink className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-1.5">
                            <span>Django Admin</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">Internal</span>
                          </div>
                          <div className="text-xs text-slate-400">Backend database models directly</div>
                        </div>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Info & Logout */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-200">
                {employee?.full_name || user.username}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {employee?.employee_id ? `${employee.employee_id} • ` : ''}
                {user.role === 'ADMIN' ? 'Central Admin' : 'Field Assistant'}
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile menu toggle */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile categorized dropdown menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-slate-800 border-t border-slate-700 px-4 pt-2 pb-6 space-y-3 max-h-[85vh] overflow-y-auto">
          {/* User Info Header */}
          <div className="py-2 border-b border-slate-700 mb-2">
            <div className="text-sm font-bold text-slate-200">
              {employee?.full_name || user.username}
            </div>
            <div className="text-xs text-slate-400">
              {employee?.employee_id ? `${employee.employee_id} • ` : ''}
              {user.role === 'ADMIN' ? 'Central Admin' : 'Field Assistant'}
            </div>
            <div className="mt-2 text-xs text-emerald-400 font-mono flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Dhaka: {currentTime}
            </div>
          </div>

          {/* Field Assistant Mobile Menu */}
          {isFieldAssistant && (
            <div className="space-y-1">
              <Link
                to="/assistant"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-xl text-base font-semibold ${
                  isActive('/assistant') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Today's Attendance
              </Link>
              <Link
                to="/assistant/history"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-xl text-base font-semibold ${
                  isActive('/assistant/history') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Attendance History
              </Link>
              <Link
                to="/assistant/requests"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-xl text-base font-semibold ${
                  isActive('/assistant/requests') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Manual Requests
              </Link>
              <Link
                to="/assistant/leaves"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-xl text-base font-semibold ${
                  isActive('/assistant/leaves') ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Leave Requests
              </Link>
            </div>
          )}

          {/* Central Admin Mobile Menu with Clean Categorized Sections */}
          {isAdmin && (
            <div className="space-y-4 pt-1">
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold ${
                  isActive('/admin') ? 'bg-emerald-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span>Dashboard</span>
              </Link>

              {/* Operations Group */}
              <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-700/60">
                <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Operations (কর্মী ব্যবস্থাপনা)
                </div>
                <Link
                  to="/admin/employees"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/employees') && !location.search.includes('action=bulk-upload') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Field Assistants & Accounts</span>
                </Link>
                <Link
                  to="/admin/employees?action=bulk-upload"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-750"
                >
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>Bulk Upload FAs</span>
                </Link>
                <Link
                  to="/admin/employee-types"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/employee-types') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-cyan-400" />
                  <span>Employee Types</span>
                </Link>
              </div>

              {/* Reports Group */}
              <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-700/60">
                <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Reports (হাজিরা রিপোর্ট)
                </div>
                <Link
                  to="/admin/daily"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/daily') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Daily Attendance Report</span>
                </Link>
                <Link
                  to="/admin/monthly"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/monthly') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-teal-400" />
                  <span>Monthly Summary</span>
                </Link>
                <Link
                  to="/admin/employee-report"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/employee-report') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Individual Employee Report</span>
                </Link>
              </div>

              {/* Approvals Group */}
              <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-700/60">
                <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Approvals (অনুমোদন)
                </div>
                <Link
                  to="/admin/manual-requests"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/manual-requests') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  <span>Manual Punch Requests</span>
                </Link>
                <Link
                  to="/admin/leaves"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/leaves') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <CalendarDays className="w-4 h-4 text-rose-400" />
                  <span>Leaves & Holidays</span>
                </Link>
              </div>

              {/* System Group */}
              <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-700/60">
                <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  System (সিস্টেম)
                </div>
                <Link
                  to="/admin/audit-logs"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/audit-logs') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span>Audit Logs</span>
                </Link>
                <Link
                  to="/admin/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold ${
                    isActive('/admin/settings') ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <span>Platform Settings</span>
                </Link>
                <a
                  href="/django-admin/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-750"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                    <span>Django Admin</span>
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Internal</span>
                </a>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-700">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-base font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Fixed Mobile Bottom Bar for Field Assistants (Thumb-Friendly Native Feel) */}
      {isFieldAssistant && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 pb-safe shadow-[0_-8px_20px_rgba(0,0,0,0.35)] flex justify-around items-center no-print print:hidden">
          <Link
            to="/assistant"
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              isActive('/assistant')
                ? 'text-emerald-400 font-bold bg-emerald-500/10 scale-105'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Today</span>
          </Link>
          <Link
            to="/assistant/history"
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              isActive('/assistant/history')
                ? 'text-emerald-400 font-bold bg-emerald-500/10 scale-105'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">History</span>
          </Link>
          <Link
            to="/assistant/requests"
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              isActive('/assistant/requests')
                ? 'text-emerald-400 font-bold bg-emerald-500/10 scale-105'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Requests</span>
          </Link>
          <Link
            to="/assistant/leaves"
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              isActive('/assistant/leaves')
                ? 'text-emerald-400 font-bold bg-emerald-500/10 scale-105'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarDays className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Leaves</span>
          </Link>
          <button
            onClick={logout}
            className="flex flex-col items-center py-1 px-3 rounded-xl text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Exit</span>
          </button>
        </div>
      )}
    </nav>
  );
};
