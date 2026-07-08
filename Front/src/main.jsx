import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { setAuthToken } from './lib/api';

function clearBrokenAuthState() {
  try {
    const token = localStorage.getItem('auth_token');
    const rawUser = localStorage.getItem('user');
    if (!token && !rawUser) return;

    if (!token || !rawUser) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      return;
    }

    const user = JSON.parse(rawUser);
    if (!user || typeof user !== 'object' || !user.role) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
  } catch {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }
}

clearBrokenAuthState();

// Read persisted token on boot (localStorage so it survives tab close + syncs across tabs)
const bootToken = localStorage.getItem('auth_token');
setAuthToken(bootToken);

class BootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[App boot failed]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: '#f0f2f5',
          color: '#1a1a2e',
          padding: 24,
          textAlign: 'center',
        }}
        >
          <strong style={{ fontSize: '1.1rem' }}>Grow Mentality failed to start</strong>
          <div style={{ maxWidth: 480, color: '#555', fontSize: 14 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }}
            style={{
              marginTop: 8,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#e0c84a',
              color: '#1a1a2e',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear session & go to login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </BootErrorBoundary>
  </React.StrictMode>
);
