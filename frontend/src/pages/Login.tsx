import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';

type LoginMode = 'fa' | 'admin';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<LoginMode>('fa');
  const [employeeId, setEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, faLogin } = useAuth();
  const navigate = useNavigate();

  const redirectFor = (role?: string) => {
    navigate(role === 'ADMIN' ? '/admin' : '/assistant');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'fa' && (!employeeId.trim() || !password)) {
      setError('Please enter your Employee ID and password.');
      return;
    }
    if (mode === 'admin' && (!username || !password)) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    const res = mode === 'fa'
      ? await faLogin(employeeId.trim(), password)
      : await login(username, password);
    setLoading(false);

    if (res.success) {
      const userStr = localStorage.getItem('fams_user');
      const user = userStr ? JSON.parse(userStr) : null;
      redirectFor(user?.role);
    } else {
      setError(res.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
            FRA
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-black tracking-tight text-white sm:text-3xl">
          FRA - Field Research Assistants Portal
        </h2>
        <p className="mt-2 text-center text-xs text-slate-400">
          Field Research Assistants • Official Timezone: Asia/Dhaka (UTC+6)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-800 py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-700">
          {/* Login mode switch */}
          <div className="mb-6 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900/70 border border-slate-700">
            <button
              type="button"
              onClick={() => switchMode('fa')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'fa'
                  ? 'bg-emerald-400 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Field Assistant
            </button>
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'admin'
                  ? 'bg-blue-400 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Administrator
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {mode === 'fa' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Employee ID
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="e.g. FA-001"
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm uppercase tracking-widest"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="off"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Username
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full touch-btn flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-slate-950 shadow-lg disabled:opacity-50 transition-all ${
                  mode === 'fa'
                    ? 'bg-emerald-400 hover:bg-emerald-300 focus:ring-emerald-500 shadow-emerald-500/20'
                    : 'bg-blue-400 hover:bg-blue-300 focus:ring-blue-500 shadow-blue-500/20'
                } focus:outline-none focus:ring-2`}
              >
                {loading ? 'Authenticating...' : 'Sign In to Portal'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Quick One-Click Demo Credentials
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { switchMode('fa'); setEmployeeId('FA-001'); setPassword('Fams@123'); }}
                className="px-3 py-2 text-xs rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 border border-slate-600/50 flex flex-col items-center text-center transition-colors"
              >
                <span className="font-bold text-emerald-400">Field Assistant</span>
                <span className="text-[10px] text-slate-400">FA-001 / Fams@123</span>
              </button>
              <button
                type="button"
                onClick={() => { switchMode('admin'); setUsername('admin'); setPassword('admin123'); }}
                className="px-3 py-2 text-xs rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 border border-slate-600/50 flex flex-col items-center text-center transition-colors"
              >
                <span className="font-bold text-blue-400">Administrator</span>
                <span className="text-[10px] text-slate-400">admin / admin123</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
