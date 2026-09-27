import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { TodayAttendanceResponse } from '../../types';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Timer,
  ArrowUpRight,
  LogOut,
  LogIn,
  MapPin,
  Building2,
  FileQuestion,
  CalendarDays,
  Sparkles,
  Navigation,
  ShieldCheck,
  Radio,
  AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';

const formatDutyDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const AssistantDashboard: React.FC = () => {
  const { employee, requireGps } = useAuth();
  const [data, setData] = useState<TodayAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStep, setActionStep] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [liveSeconds, setLiveSeconds] = useState<number>(0);

  const isHttp = typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  const fetchTodayStatus = async () => {
    try {
      const res = await apiClient.get<TodayAttendanceResponse>('/attendance/today/');
      setData(res.data);
      if (res.data.attendance && !res.data.attendance.check_out_time) {
        const checkInMs = new Date(res.data.attendance.check_in_time).getTime();
        const serverMs = new Date(res.data.server_datetime).getTime();
        const elapsedSec = Math.max(0, Math.floor((serverMs - checkInMs) / 1000));
        setLiveSeconds(elapsedSec);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  // Real-time ticking working duration timer
  useEffect(() => {
    if (data?.is_checked_in && !data?.is_checked_out) {
      const timer = setInterval(() => {
        setLiveSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [data?.is_checked_in, data?.is_checked_out]);

  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getCoordinates = (): Promise<{ latitude?: number; longitude?: number; accuracy?: number }> => {
    // GPS is disabled by default in the server-authoritative settings. Never touch
    // the geolocation API in that case: no browser permission prompt, no 8s stall.
    if (!requireGps) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve({});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy)
          });
        },
        (err) => {
          console.warn('GPS location access denied or unavailable:', err.message);
          resolve({});
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  };

  const punch = async (endpoint: 'check-in' | 'check-out') => {
    setFeedback(null);
    setActionLoading(true);
    setActionStep(requireGps ? 'Acquiring real GPS coordinates...' : 'Recording on server (Asia/Dhaka)...');
    try {
      const coords = await getCoordinates();
      if (requireGps) {
        setActionStep('Recording on server (Asia/Dhaka)...');
      }
      const res = await apiClient.post(`/attendance/${endpoint}/`, coords);
      setFeedback({ type: 'success', message: res.data.detail });
      await fetchTodayStatus();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setActionLoading(false);
      setActionStep('');
    }
  };

  const handleCheckIn = () => punch('check-in');
  const handleCheckOut = () => punch('check-out');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] gap-3">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Loading Attendance Terminal...</p>
      </div>
    );
  }

  const isCheckedIn = data?.is_checked_in ?? false;
  const isCheckedOut = data?.is_checked_out ?? false;
  const attendance = data?.attendance;
  const missed = data?.missed_checkout ?? null;

  const missedCheckoutMessage = !missed
    ? ''
    : missed.count > 1
      ? `You have ${missed.count} duty days with no check-out. The most recent, ${formatDutyDate(
          missed.attendance_date
        )}, was checked in at ${missed.check_in_display} but never closed. The duty day has ended, so submit a manual check-out request for admin approval.`
      : `Your duty on ${formatDutyDate(missed.attendance_date)} was checked in at ${
          missed.check_in_display
        } but never checked out. The duty day has ended, so submit a manual check-out request for admin approval.`;

  return (
    <div className="max-w-lg mx-auto px-3.5 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
      {/* Mobile Top App Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-4 sm:p-5 text-white shadow-lg border border-slate-700/60 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-black text-lg shadow-md shrink-0">
              {employee?.full_name ? employee.full_name.charAt(0).toUpperCase() : 'FA'}
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white leading-tight">
                {employee?.full_name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5 flex-wrap">
                <span className="font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 rounded text-[11px]">
                  {employee?.employee_id}
                </span>
                {employee?.project_name ? (
                  <span className="text-[11px] text-slate-300 font-medium truncate max-w-[170px]">
                    • {employee.project_name}
                  </span>
                ) : employee?.district ? (
                  <span className="text-[11px] text-slate-300 font-medium">
                    • {employee.district}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-[10px] font-mono text-emerald-400 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{data?.server_date || new Date().toISOString().split('T')[0]}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              Dhaka Time Authority
            </div>
          </div>
        </div>
      </div>

      {/* Missed check-out warning: a duty day was checked in but never closed,
          so it passed 11:59 PM and can no longer be closed from the field. */}
      {missed && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-3.5 sm:p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                Missed Check-Out
              </h2>
              <p className="text-[11px] sm:text-xs text-amber-900 mt-1 leading-relaxed font-medium">
                {missedCheckoutMessage}
              </p>
            </div>
          </div>
          <Link
            to={`/assistant/requests?date=${missed.attendance_date}`}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wide shadow-md shadow-amber-600/25 transition-colors"
          >
            <FileQuestion className="w-4 h-4" />
            Request Manual Check-Out
          </Link>
        </div>
      )}

      {/* HTTPS Notice for Mobile GPS (if viewing on insecure HTTP) */}
      {isHttp && requireGps && (        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium text-[11px]">Switch to HTTPS for GPS support</span>
          </div>
          <a
            href={`https://${window.location.hostname}${window.location.pathname}`}
            className="px-2.5 py-1 bg-amber-700 text-white font-bold rounded-lg text-[11px] hover:bg-amber-800 shrink-0"
          >
            Use HTTPS
          </a>
        </div>
      )}

      {/* Live Action Progress Alert (when checking in/out) */}
      {actionLoading && actionStep && (
        <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-2xl text-xs font-semibold text-blue-900 flex items-center justify-center gap-2.5 shadow-sm animate-pulse">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>{actionStep}</span>
        </div>
      )}

      {/* Instant Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-sm transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <div className="flex-1 leading-snug">{feedback.message}</div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🚀 MAIN HERO ATTENDANCE CARD (Attention-Grabbing Terminal) */}
      {/* ========================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-200/90 text-center relative overflow-hidden">
        {/* Dynamic Background Halo depending on state */}
        <div
          className={`absolute inset-x-0 -top-16 h-44 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
            !isCheckedIn
              ? 'bg-emerald-500/15'
              : isCheckedOut
              ? 'bg-blue-500/10'
              : 'bg-rose-500/15'
          }`}
        />

        {/* Status Pill Header */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {!isCheckedIn ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              READY TO PUNCH IN
            </span>
          ) : isCheckedOut ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              SHIFT COMPLETED TODAY
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ON DUTY • SHIFT IN PROGRESS
            </span>
          )}
        </div>

        {/* ========================================================= */}
        {/* STATE 1: READY TO CHECK IN -> MEGA ATTENTION-GRABBING BUTTON */}
        {/* ========================================================= */}
        {!isCheckedIn && (
          <div className="py-3 sm:py-5 flex flex-col items-center">
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6 font-medium">
              Tap the button to capture your server-verified attendance and real GPS location.
            </p>

            {/* Glowing Concentric Punch Button */}
            <div className="relative my-2 sm:my-3 flex items-center justify-center">
              {/* Outer Ambient Ping Ripple */}
              <div className="absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-emerald-400/20 animate-ping pointer-events-none duration-1000" />
              
              {/* Pulsing Concentric Glowing Halo */}
              <div className="absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full border-2 border-emerald-400/40 animate-glow-checkin pointer-events-none" />

              {/* The Hero Button */}
              <button
                onClick={handleCheckIn}
                disabled={actionLoading}
                className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-[0_16px_45px_rgba(16,185,129,0.48)] hover:shadow-[0_20px_55px_rgba(16,185,129,0.6)] active:shadow-[0_4px_15px_rgba(16,185,129,0.4)] active:scale-95 transition-all duration-200 cursor-pointer border-4 border-white/50 disabled:opacity-60 disabled:cursor-not-allowed group select-none"
              >
                {/* Glossy Upper Reflection */}
                <div className="absolute top-2 inset-x-8 h-1/2 bg-gradient-to-b from-white/35 to-transparent rounded-t-full pointer-events-none" />

                {actionLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-black tracking-wider uppercase mt-1">Recording...</span>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-white/20 rounded-full backdrop-blur-xs mb-1.5 shadow-inner group-hover:scale-110 transition-transform">
                      <LogIn className="w-8 h-8 text-white stroke-[2.5]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black tracking-wider text-white drop-shadow-sm">
                      CHECK IN
                    </span>
                    <span className="text-[11px] font-bold text-emerald-100/90 tracking-wide mt-0.5">
                      Tap to Punch In
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* GPS Location Ready Indicator */}
            <div className="mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold">
              <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Real GPS Location Auto-Captured</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STATE 2: CHECKED IN (ACTIVE ON DUTY) -> MEGA CHECK OUT BUTTON */}
        {/* ========================================================= */}
        {isCheckedIn && !isCheckedOut && (
          <div className="py-2 sm:py-4 flex flex-col items-center space-y-4">
            {/* Live Stopwatch LED Counter Card */}
            <div className="w-full bg-slate-900 rounded-2xl p-4 text-white shadow-inner border border-slate-800 space-y-1">
              <div className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Active Working Duration</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white py-1">
                {formatTimer(liveSeconds)}
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Punched In at <strong className="text-emerald-400">{attendance?.check_in_display}</strong>
              </div>
            </div>

            {/* Glowing Concentric Check-Out Button */}
            <div className="relative my-2 sm:my-3 flex items-center justify-center">
              {/* Outer Ambient Crimson Ping Ripple */}
              <div className="absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-rose-500/20 animate-ping pointer-events-none duration-1000" />
              
              {/* Pulsing Concentric Glowing Halo */}
              <div className="absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full border-2 border-rose-500/40 animate-glow-checkout pointer-events-none" />

              {/* The Hero Check-Out Button */}
              <button
                onClick={handleCheckOut}
                disabled={actionLoading}
                className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full flex flex-col items-center justify-center bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 text-white shadow-[0_16px_45px_rgba(244,63,94,0.48)] hover:shadow-[0_20px_55px_rgba(244,63,94,0.6)] active:shadow-[0_4px_15px_rgba(244,63,94,0.4)] active:scale-95 transition-all duration-200 cursor-pointer border-4 border-white/50 disabled:opacity-60 disabled:cursor-not-allowed group select-none"
              >
                {/* Glossy Upper Reflection */}
                <div className="absolute top-2 inset-x-8 h-1/2 bg-gradient-to-b from-white/35 to-transparent rounded-t-full pointer-events-none" />

                {actionLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-black tracking-wider uppercase mt-1">Recording...</span>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-white/20 rounded-full backdrop-blur-xs mb-1.5 shadow-inner group-hover:scale-110 transition-transform">
                      <LogOut className="w-8 h-8 text-white stroke-[2.5]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black tracking-wider text-white drop-shadow-sm">
                      CHECK OUT
                    </span>
                    <span className="text-[11px] font-bold text-rose-100/90 tracking-wide mt-0.5">
                      Tap to End Shift
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STATE 3: SHIFT COMPLETED -> CELEBRATORY SUMMARY & STATS */}
        {/* ========================================================= */}
        {isCheckedOut && (
          <div className="py-3 sm:py-4 space-y-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-emerald-900">
                Shift Completed Successfully!
              </h2>
              <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                Your full attendance record has been secured with authoritative server timestamps.
              </p>
            </div>

            {/* 3 Summary Metric Pills */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Punched In</div>
                <div className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5">
                  {attendance?.check_in_display || '--'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Punched Out</div>
                <div className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5">
                  {attendance?.check_out_display || '--'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">Duration</div>
                <div className="text-xs sm:text-sm font-black font-mono text-emerald-900 mt-0.5">
                  {attendance?.working_duration_display || '--'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* REAL-TIME PHYSICAL LOCATION DATA CARDS */}
        {/* ========================================================= */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          {/* Check-In Location Card */}
          {attendance?.check_in_latitude && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5 shadow-2xs">
              <div className="font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Check-In Physical Location
                </span>
                <a
                  href={`https://www.google.com/maps?q=${attendance.check_in_latitude},${attendance.check_in_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-bold hover:underline text-[11px]"
                  title="Open exact pin on Google Maps"
                >
                  <span>Google Maps</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
              {attendance.check_in_address && (
                <div className="text-slate-800 font-medium bg-white p-2 rounded-xl border border-slate-200 text-xs leading-relaxed">
                  {attendance.check_in_address}
                </div>
              )}
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                <span>Lat: {attendance.check_in_latitude}, Lng: {attendance.check_in_longitude}</span>
                {attendance.check_in_accuracy && <span>±{attendance.check_in_accuracy}m accuracy</span>}
              </div>
              {attendance.check_in_distance_meters !== null && attendance.check_in_distance_meters !== undefined && (
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    {attendance.check_in_distance_meters >= 1000
                      ? `${(attendance.check_in_distance_meters / 1000).toFixed(1)} km from Site Center`
                      : `${attendance.check_in_distance_meters}m from Site Center`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Check-Out Location Card */}
          {attendance?.check_out_latitude && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5 shadow-2xs">
              <div className="font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                  <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  Check-Out Physical Location
                </span>
                <a
                  href={`https://www.google.com/maps?q=${attendance.check_out_latitude},${attendance.check_out_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-bold hover:underline text-[11px]"
                  title="Open exact pin on Google Maps"
                >
                  <span>Google Maps</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
              {attendance.check_out_address && (
                <div className="text-slate-800 font-medium bg-white p-2 rounded-xl border border-slate-200 text-xs leading-relaxed">
                  {attendance.check_out_address}
                </div>
              )}
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono">
                <span>Lat: {attendance.check_out_latitude}, Lng: {attendance.check_out_longitude}</span>
                {attendance.check_out_accuracy && <span>±{attendance.check_out_accuracy}m accuracy</span>}
              </div>
              {attendance.check_out_distance_meters !== null && attendance.check_out_distance_meters !== undefined && (
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    {attendance.check_out_distance_meters >= 1000
                      ? `${(attendance.check_out_distance_meters / 1000).toFixed(1)} km from Site Center`
                      : `${attendance.check_out_distance_meters}m from Site Center`}
                  </span>
                </div>
              )}
          </div>
        )}
        </div>

        {/* Server Clock Authority Notice */}
        <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Server Clock: <strong>{data?.server_time_display}</strong> (Asia/Dhaka)</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 📱 MOBILE QUICK-ACTION TILES (1-Thumb Thumb-Friendly Access) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Link
          to="/assistant/history"
          className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 active:scale-[0.99] transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-900">Attendance History</div>
              <div className="text-[11px] text-slate-400">Past punch records</div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
        </Link>

        <Link
          to="/assistant/requests"
          className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 active:scale-[0.99] transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-900">Manual Request</div>
              <div className="text-[11px] text-slate-400">Missed a punch?</div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
        </Link>

        <Link
          to="/assistant/leaves"
          className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 active:scale-[0.99] transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-900">Leave Requests</div>
              <div className="text-[11px] text-slate-400">Apply for time off</div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
        </Link>
      </div>
    </div>
  );
};
