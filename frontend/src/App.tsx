import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SESSION_EXPIRED_EVENT } from './lib/api';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';

// Assistant Pages
import { AssistantDashboard } from './pages/assistant/AssistantDashboard';
import { AssistantHistory } from './pages/assistant/AssistantHistory';
import { AssistantManualRequest } from './pages/assistant/AssistantManualRequest';
import { AssistantLeaves } from './pages/assistant/AssistantLeaves';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminDailyReport } from './pages/admin/AdminDailyReport';
import { AdminMonthlyReport } from './pages/admin/AdminMonthlyReport';
import { AdminEmployeeReport } from './pages/admin/AdminEmployeeReport';
import { AdminManualRequests } from './pages/admin/AdminManualRequests';
import { AdminLeaves } from './pages/admin/AdminLeaves';
import { AdminEmployees } from './pages/admin/AdminEmployees';
import { AdminAuditLogs } from './pages/admin/AdminAuditLogs';
import { AdminSettings } from './pages/admin/AdminSettings';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRole?: 'ADMIN' | 'FIELD_ASSISTANT';
}> = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();

  // Role mismatch is checked BEFORE the loading gate. A field assistant who lands
  // on an admin URL is redirected immediately rather than sitting on a spinner at
  // /admin until the server confirms the role. This branch only ever navigates
  // away from a forbidden page, so the unverified role is never rendered.
  if (user && allowedRole && user.role !== allowedRole) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/assistant'} replace />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <div className="no-print print:hidden">
        <Navbar />
      </div>
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50 pb-24 sm:pb-8 print:min-h-0 print:bg-white print:p-0 print:m-0 print:pb-0">
        {children}
      </main>
    </>
  );
};

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/assistant" replace />;
};

/**
 * Redirects to /login in-app when the API client gives up on a session. This lives
 * inside the router so the transition is a client-side navigation instead of a full
 * page reload, which was causing a white flash and a remounted AuthProvider.
 */
const SessionWatcher: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onExpired = () => navigate('/login', { replace: true });
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate]);

  return null;
};

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionWatcher />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Assistant Routes */}
          <Route
            path="/assistant"
            element={
              <ProtectedRoute allowedRole="FIELD_ASSISTANT">
                <AssistantDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant/history"
            element={
              <ProtectedRoute allowedRole="FIELD_ASSISTANT">
                <AssistantHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant/requests"
            element={
              <ProtectedRoute allowedRole="FIELD_ASSISTANT">
                <AssistantManualRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant/leaves"
            element={
              <ProtectedRoute allowedRole="FIELD_ASSISTANT">
                <AssistantLeaves />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/daily"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminDailyReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/monthly"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminMonthlyReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employee-report"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminEmployeeReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/manual-requests"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminManualRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/leaves"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminLeaves />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/projects"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminEmployees initialTab="locations" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/accounts"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminEmployees initialTab="assistants" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminEmployees initialTab="assistants" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminAuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRole="ADMIN">
                <AdminSettings />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
