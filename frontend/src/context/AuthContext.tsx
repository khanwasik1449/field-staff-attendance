import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Employee, MeResponse, MeSettings } from '../types';
import { apiClient, extractErrorMessage } from '../lib/api';

interface AuthContextType {
  user: User | null;
  employee: Employee | null;
  settings: MeSettings | null;
  requireGps: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isFieldAssistant: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('fams_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [employee, setEmployee] = useState<Employee | null>(() => {
    const saved = localStorage.getItem('fams_employee');
    return saved ? JSON.parse(saved) : null;
  });
  const [settings, setSettings] = useState<MeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const token = localStorage.getItem('fams_access_token');
    if (!token) {
      setUser(null);
      setEmployee(null);
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get<MeResponse>('/auth/me/');
      setUser(res.data.user);
      setEmployee(res.data.employee);
      setSettings(res.data.settings);
      localStorage.setItem('fams_user', JSON.stringify(res.data.user));
      if (res.data.employee) {
        localStorage.setItem('fams_employee', JSON.stringify(res.data.employee));
      }
    } catch {
      // Session is not usable. Drop the cached identity so no page renders
      // against a dead session while the interceptor redirects to /login.
      setUser(null);
      setEmployee(null);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await apiClient.post('/auth/login/', { username, password });
      const { access, refresh, user: userData, employee: empData } = res.data;

      localStorage.setItem('fams_access_token', access);
      localStorage.setItem('fams_refresh_token', refresh);
      localStorage.setItem('fams_user', JSON.stringify(userData));
      if (empData) {
        localStorage.setItem('fams_employee', JSON.stringify(empData));
      }

      setUser(userData);
      setEmployee(empData);
      // Hydrate the server-authoritative settings (GPS flags, shift rules) before
      // the assistant lands on the punch screen, so the first check-in already
      // knows whether location capture is required.
      await refreshMe();
      return { success: true };
    } catch (err) {
      return { success: false, error: extractErrorMessage(err) };
    }
  };

  const logout = () => {
    localStorage.removeItem('fams_access_token');
    localStorage.removeItem('fams_refresh_token');
    localStorage.removeItem('fams_user');
    localStorage.removeItem('fams_employee');
    try {
      document.cookie = 'sessionid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'csrftoken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } catch {}
    setUser(null);
    setEmployee(null);
    setSettings(null);
    window.location.href = '/login';
  };

  const isAdmin = user?.role === 'ADMIN';
  const isFieldAssistant = user?.role === 'FIELD_ASSISTANT';
  const requireGps = settings?.require_gps ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        employee,
        settings,
        requireGps,
        isAuthenticated: !!user,
        isAdmin,
        isFieldAssistant,
        login,
        logout,
        refreshMe,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
