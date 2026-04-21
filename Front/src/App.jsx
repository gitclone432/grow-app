import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ProductResearchPage from './pages/admin/ProductResearchPage.jsx';
import AddListerPage from './pages/admin/AddListerPage.jsx';
import ListingAnalyticsPage from './pages/admin/ListingAnalyticsPage.jsx';
import ListerDashboard from './pages/lister/ListerDashboard.jsx';
import RangeAnalyzerPage from './pages/admin/RangeAnalyzerPage.jsx';
import SellerEbayPage from './pages/SellerProfilePage.jsx';
import AboutMePage from './pages/AboutMePage.jsx';
import MessageReceivedPage from './pages/admin/MessageReceivedPage.jsx';
import PayoneerSheetPage from './pages/admin/PayoneerSheetPage.jsx';
import BankAccountsPage from './pages/admin/BankAccountsPage.jsx';
import TransactionPage from './pages/admin/TransactionPage.jsx';
import SalaryPage from './pages/admin/SalaryPage.jsx';
import IdeasPage from './pages/IdeasPage.jsx';

import { setAuthToken } from './lib/api'
import { AttendanceProvider } from './context/AttendanceContext';
import AttendanceModal from './components/Attendance/AttendanceModal';
import AttendanceTimer from './components/Attendance/AttendanceTimer';
import TimerPausedModal from './components/Attendance/TimerPausedModal';
import { PAGE_REGISTRY } from './constants/pages';
import { createAppTheme } from './theme/appTheme';

const BASE_DOCUMENT_TITLE = 'Grow Mentality • EMS';

const STATIC_PAGE_TITLES = {
  '/': BASE_DOCUMENT_TITLE,
  '/login': `Login • ${BASE_DOCUMENT_TITLE}`,
  '/ideas': `Ideas & Issues • ${BASE_DOCUMENT_TITLE}`,
  '/about-me': `About Me • ${BASE_DOCUMENT_TITLE}`,
  '/admin/about-me': `About Me • ${BASE_DOCUMENT_TITLE}`,
  '/admin/my-leaves': `My Leaves • ${BASE_DOCUMENT_TITLE}`,
  '/admin/internal-messages': `Team Chat • ${BASE_DOCUMENT_TITLE}`,
  '/admin/ideas': `Ideas & Issues • ${BASE_DOCUMENT_TITLE}`,
  '/admin/user-performance': `User Performance Logs • ${BASE_DOCUMENT_TITLE}`,
  '/lister': `My Dashboard • ${BASE_DOCUMENT_TITLE}`,
  '/lister/range-analyzer': `Range Analyzer • ${BASE_DOCUMENT_TITLE}`,
  '/seller-ebay': `Seller Profile • ${BASE_DOCUMENT_TITLE}`,
};

const ADMIN_ROUTE_TITLE_OVERRIDES = {
  '/admin/conversation-tracking': 'Conversation Tracking',
  '/admin/cancelled-status': 'Issues and Resolutions',
  '/admin/return-requested': 'Issues and Resolutions',
  '/admin/worksheet': 'Issues and Resolutions',
  '/admin/template-listings': 'Template Listings',
  '/admin/seller-templates': 'Seller Templates',
  '/admin/template-listing-analytics': 'Template Listing Analytics',
  '/admin/store-wise-tasks/details': 'Store-Wise Task Details',
  '/admin/lister-info/details': 'Lister Info Details',
};

function formatDocumentTitle(pageTitle) {
  return pageTitle ? `${pageTitle} • ${BASE_DOCUMENT_TITLE}` : BASE_DOCUMENT_TITLE;
}

function resolveAdminRegistryTitle(pathname) {
  const registryMatch = PAGE_REGISTRY.find((page) => pathname === `/admin${page.path}` || pathname.startsWith(`/admin${page.path}/`));
  return registryMatch?.name || '';
}

function resolveDocumentTitle(pathname) {
  if (STATIC_PAGE_TITLES[pathname]) {
    return STATIC_PAGE_TITLES[pathname];
  }

  if (ADMIN_ROUTE_TITLE_OVERRIDES[pathname]) {
    return formatDocumentTitle(ADMIN_ROUTE_TITLE_OVERRIDES[pathname]);
  }

  if (pathname.startsWith('/admin/')) {
    const registryTitle = resolveAdminRegistryTitle(pathname);
    return formatDocumentTitle(registryTitle || 'Admin Dashboard');
  }

  if (pathname.startsWith('/lister/')) {
    return formatDocumentTitle('My Dashboard');
  }

  return BASE_DOCUMENT_TITLE;
}

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const navigate = useNavigate();
  const login = (t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('auth_token', t);
    setAuthToken(t);
    localStorage.setItem('user', JSON.stringify(u));

    // Navigation Logic
    if (u.role === 'lister') navigate('/lister');
    else if (u.role === 'advancelister') navigate('/lister');
    else if (u.role === 'trainee') navigate('/lister');
    else if (u.role === 'compatibilityadmin') navigate('/admin/compatibility-tasks');
    else if (u.role === 'compatibilityeditor') navigate('/admin/compatibility-editor');
    else if (u.role === 'seller') navigate('/seller-ebay');
    else if (u.role === 'fulfillmentadmin') navigate('/admin/fulfillment');
    else if (u.role === 'hradmin') navigate('/admin/employee-details');
    else if (u.role === 'hr') navigate('/admin/about-me');
    else if (u.role === 'operationhead') navigate('/admin/employee-details');
    // For HOC and Compliance Manager, we send them to the general admin area
    // AdminLayout will handle the specific redirect to /fulfillment
    else navigate('/admin');
  };
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    setAuthToken(null);
    localStorage.removeItem('user');
    navigate('/login');
  };
  // Cross-tab sync: when another tab logs out (removes auth_token from localStorage),
  // mirror the logout in this tab immediately.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'auth_token' && !e.newValue) {
        setToken(null);
        setUser(null);
        setAuthToken(null);
        navigate('/login');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [navigate]);
  return { token, user, login, logout };
}

export default function App() {
  const { token, user, login, logout } = useAuth();
  const location = useLocation();
  const theme = useMemo(() => createAppTheme(), []);

  useEffect(() => {
    document.title = resolveDocumentTitle(location.pathname);
  }, [location.pathname]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {token && user ? (
        <AttendanceProvider user={user}>
          <AttendanceModal />
          <TimerPausedModal />
          <AttendanceTimer />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage onLogin={login} />} />

            {/* PUBLIC ROUTE - No authentication required */}
            <Route path="/ideas" element={<IdeasPage />} />

            <Route
              path="/about-me"
              element={<AboutMePage />}
            />

            <Route
              path="/admin/*"
              element={
                user.role === 'productadmin' ||
                  user.role === 'listingadmin' ||
                  user.role === 'superadmin' ||
                  user.role === 'compatibilityadmin' ||
                  user.role === 'compatibilityeditor' ||
                  user.role === 'fulfillmentadmin' ||
                  user.role === 'hradmin' ||
                  user.role === 'hr' ||
                  user.role === 'operationhead' ||
                  user.role === 'hoc' ||
                  user.role === 'compliancemanager' ||
                  // Lister roles - access to template listing workflow only
                  user.role === 'lister' ||
                  user.role === 'advancelister' ||
                  user.role === 'trainee' ? (
                  <AdminLayout user={user} onLogout={logout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/lister"
              element={user.role === 'lister' || user.role === 'advancelister' || user.role === 'trainee' ? <ListerDashboard user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/lister/range-analyzer"
              element={user.role === 'lister' || user.role === 'advancelister' || user.role === 'trainee' ? <RangeAnalyzerPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/seller-ebay"
              element={
                user.role === 'seller' || user.role === 'superadmin' ? (
                  <SellerEbayPage user={user} onLogout={logout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AttendanceProvider>
      ) : (
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage onLogin={login} />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </ThemeProvider>
  );
}