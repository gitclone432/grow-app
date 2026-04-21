
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getServerBaseUrl } from '../lib/serverBaseUrl.js';

export default function SellerProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ebayConnected, setEbayConnected] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [sellerData, setSellerData] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    // Check if redirected back from eBay with success
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setSuccessMessage('eBay account connected successfully!');
      // Clean up URL
      window.history.replaceState({}, '', '/seller-ebay');
      // Force reload profile after a short delay
      setTimeout(() => {
        fetchProfile();
      }, 1000);
    } else {
      fetchProfile();
    }
  }, []);

  async function fetchProfile() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/sellers/me');
      console.log('Seller profile data:', data);
      setSellerData(data);
      
      // Check if eBay tokens exist and are valid
      const hasTokens = data.ebayTokens && 
                       data.ebayTokens.access_token && 
                       data.ebayTokens.access_token.length > 0;
      
      console.log('Has eBay tokens:', hasTokens);
      setEbayConnected(hasTokens);
    } catch (e) {
      console.error('Failed to load profile:', e);
      setError(e.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  function handleConnectEbay() {
    // Get the auth token from localStorage
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Authentication token not found. Please log in again.');
      return;
    }
    const serverUrl = getServerBaseUrl();
    window.location.href = `${serverUrl}/api/ebay/connect?token=${encodeURIComponent(token)}`;
  }

  async function handleDisconnectEbay() {
    if (!window.confirm('Are you sure you want to disconnect your eBay account? You will need to reconnect to use eBay features.')) {
      return;
    }
    
    setDisconnecting(true);
    setError('');
    try {
      await api.delete('/sellers/disconnect-ebay');
      setSuccessMessage('eBay account disconnected. You can reconnect with updated permissions.');
      setEbayConnected(false);
      setSellerData(prev => ({ ...prev, ebayTokens: {} }));
    } catch (e) {
      console.error('Failed to disconnect eBay:', e);
      setError(e.response?.data?.error || 'Failed to disconnect eBay account');
    } finally {
      setDisconnecting(false);
    }
  }

  function handleLogout() {
    // Clear auth token
    localStorage.removeItem('auth_token');
    // Redirect to login
    navigate('/login');
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Seller Profile</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            type="button" 
            onClick={() => navigate('/about-me')}
            style={{ 
              background: '#0064d2', 
              color: '#fff', 
              padding: '8px 16px', 
              borderRadius: 6, 
              border: 'none',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            💬 Team Chat
          </button>
          <button 
            type="button" 
            onClick={handleLogout}
            style={{ 
              background: '#dc3545', 
              color: '#fff', 
              padding: '8px 16px', 
              borderRadius: 6, 
              border: 'none',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>
      
      {successMessage && <div style={{ color: 'green', marginBottom: 16, padding: 12, background: '#d4edda', borderRadius: 4, border: '1px solid #c3e6cb' }}>{successMessage}</div>}
      {error && <div style={{ color: 'red', marginBottom: 16, padding: 12, background: '#f8d7da', borderRadius: 4, border: '1px solid #f5c6cb' }}>{error}</div>}
      
      <div style={{ marginTop: 24, padding: 20, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
        <h3 style={{ marginTop: 0 }}>eBay Account Status</h3>
        {loading ? (
          <p>Loading...</p>
        ) : ebayConnected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 24, color: '#28a745' }}>✓</span>
              <span style={{ fontSize: 16, fontWeight: 'bold', color: '#28a745' }}>Connected</span>
            </div>
            {sellerData?.ebayTokens?.fetchedAt && (
              <p style={{ fontSize: 14, color: '#6c757d', marginBottom: 16 }}>
                Connected on: {new Date(sellerData.ebayTokens.fetchedAt).toLocaleString()}
              </p>
            )}
            <button 
              type="button" 
              onClick={handleDisconnectEbay}
              disabled={disconnecting}
              style={{ 
                background: '#dc3545', 
                color: '#fff', 
                padding: '10px 20px', 
                borderRadius: 6, 
                border: 'none',
                fontSize: 14,
                fontWeight: 'bold',
                cursor: disconnecting ? 'not-allowed' : 'pointer',
                opacity: disconnecting ? 0.7 : 1
              }}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect eBay Account'}
            </button>
            <p style={{ fontSize: 12, color: '#6c757d', marginTop: 8, marginBottom: 0 }}>
              Disconnect and reconnect to update eBay permissions.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: '#6c757d', marginBottom: 16 }}>Your eBay account is not connected yet.</p>
            <button 
              type="button" 
              onClick={handleConnectEbay}
              style={{ 
                background: '#0064d2', 
                color: '#fff', 
                padding: '12px 24px', 
                borderRadius: 6, 
                border: 'none',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Connect eBay Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
