import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { AttendanceSetting } from '../../types';
import { Settings, Save, CheckCircle2, AlertCircle, Clock, Globe } from 'lucide-react';

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<AttendanceSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get<AttendanceSetting>('/attendance/settings/');
      setSettings(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiClient.patch<AttendanceSetting>('/attendance/settings/', settings);
      setSettings(res.data);
      setSuccessMessage('Attendance rules updated successfully and applied across system.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          System Attendance Configuration
        </h1>
        <p className="text-xs text-slate-500">
          Modify official business rules, shift timings, grace periods, and timezone standards
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {settings && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Settings className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Shift & Punctuality Parameters</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Shift Start Time
              </label>
              <input
                type="time"
                step="1"
                value={settings.work_start_time}
                onChange={(e) => setSettings({ ...settings, work_start_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">Check-ins after this (+ grace) mark employee as LATE.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Shift End Time
              </label>
              <input
                type="time"
                step="1"
                value={settings.work_end_time}
                onChange={(e) => setSettings({ ...settings, work_end_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">Standard shift departure reference time.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Late Grace Period (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={settings.late_grace_minutes}
                onChange={(e) => setSettings({ ...settings, late_grace_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Half-Day Min Minutes
              </label>
              <input
                type="number"
                min="60"
                value={settings.half_day_minimum_minutes}
                onChange={(e) => setSettings({ ...settings, half_day_minimum_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Full-Day Min Minutes
              </label>
              <input
                type="number"
                min="120"
                value={settings.full_day_minimum_minutes}
                onChange={(e) => setSettings({ ...settings, full_day_minimum_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Authoritative Timezone
            </label>
            <input
              type="text"
              value={settings.timezone}
              disabled
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm font-mono cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-400 mt-1">Configured invariant standard: Asia/Dhaka (UTC+6).</p>
          </div>

          {/* GPS and Geofencing Settings */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              GPS & Geofencing Security
            </h3>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                id="require_gps"
                checked={settings.require_gps || false}
                onChange={(e) => setSettings({ ...settings, require_gps: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <label htmlFor="require_gps" className="cursor-pointer">
                <div className="text-xs font-bold text-slate-800">Mandatory GPS Location</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Require field assistants' devices to supply accurate GPS coordinates during check-in and check-out.
                  When disabled, the mobile app never requests location permission and punches are recorded without coordinates.
                </div>
              </label>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                id="enforce_geofence"
                checked={settings.enforce_geofence || false}
                onChange={(e) => setSettings({ ...settings, enforce_geofence: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <label htmlFor="enforce_geofence" className="cursor-pointer">
                <div className="text-xs font-bold text-slate-800">Enforce Geofence Perimeter</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Block check-in outside the assigned work site radius. This flag is saved and reported, but perimeter
                  blocking is currently disabled server-side — out-of-site punches are recorded and flagged, never rejected.
                </div>
              </label>
            </div>

          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Changes...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
