import React from 'react';
import { getServerBaseUrl } from '../lib/serverBaseUrl.js';

export default function EbayConnectButton({ isConnected }) {
  const ebayConnectUrl = `${getServerBaseUrl()}/api/ebay/connect`;
  return (
    <div style={{ margin: '2rem 0' }}>
      {isConnected ? (
        <button disabled style={{ background: '#ccc', color: '#333', padding: '0.75rem 2rem', borderRadius: 6 }}>
          eBay Connected
        </button>
      ) : (
        <a href={ebayConnectUrl}>
          <button style={{ background: '#0064d2', color: '#fff', padding: '0.75rem 2rem', borderRadius: 6 }}>
            Connect your eBay Account
          </button>
        </a>
      )}
    </div>
  );
}
