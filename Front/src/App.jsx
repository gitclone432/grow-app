import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, ThemeProvider, CssBaseline } from '@mui/material';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx';

import { setAuthToken } from './lib/api';
import { PAGE_REGISTRY } from './constants/pages';
import { createAppTheme } from './theme/appTheme';

const AdminLayout = lazy(() => import('./layouts/AdminLayout.jsx'));
const IdeasPage = lazy(() => import('./pages/IdeasPage.jsx'));
const AboutMePage = lazy(() => import('./pages/AboutMePage.jsx'));
const ListerDashboard = lazy(() => import('./pages/lister/ListerDashboard.jsx'));
const SellerEbayPage = lazy(() => import('./pages/SellerProfilePage.jsx'));

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

function RouteFallback() {
  // Keep this lightweight — a hanging Suspense should still leave #root non-empty
  // so the HTML boot splash (#root:empty) does not stay forever.
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <CircularProgress size={28} />
    </Box>
  );
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.role) {
      localStorage.removeItem('user');
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState(() => readStoredUser());
  const navigate = useNavigate();

  // Token without a valid user (or vice versa) leaves the app stuck on the boot splash.
  useEffect(() => {
    if (token && !user) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      setAuthToken(null);
      setToken(null);
    } else if (!token && user) {
      localStorage.removeItem('user');
      setUser(null);
    }
  }, [token, user]);

  const login = (t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('auth_token', t);
    setAuthToken(t);
    localStorage.setItem('user', JSON.stringify(u));

    if (u.role === 'lister') navigate('/lister');
    else if (u.role === 'advancelister') navigate('/lister');
    else if (u.role === 'trainee') navigate('/lister');
    else if (u.role === 'compatibilityadmin') navigate('/admin/compatibility-tasks');
    else if (u.role === 'compatibilityeditor') navigate('/admin/compatibility-editor');
    else if (u.role === 'seller') navigate('/seller-ebay');
    else if (u.role === 'fulfillmentadmin') navigate('/admin/fulfillment');
    else if (u.role === 'hradmin') navigate('/admin/employee-management');
    else if (u.role === 'hr') navigate('/admin/about-me');
    else if (u.role === 'operationhead') navigate('/admin/employee-management');
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
      <Suspense fallback={<RouteFallback />}>
        {token && user ? (
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage onLogin={login} />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/about-me" element={<AboutMePage />} />
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
        ) : (
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage onLogin={login} />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        )}
      </Suspense>
    </ThemeProvider>
  );
}
