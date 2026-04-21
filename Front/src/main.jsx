import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { setAuthToken } from './lib/api';

// Read persisted token on boot (localStorage so it survives tab close + syncs across tabs)
const bootToken = localStorage.getItem('auth_token');
setAuthToken(bootToken);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


