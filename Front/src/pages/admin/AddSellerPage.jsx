import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../lib/api.js';

export default function AddSellerPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCreds, setShowCreds] = useState(false);
  const [created, setCreated] = useState({ username: '', password: '' });

  const handleCreateSeller = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.post('/users/seller', {
        username: username.trim(),
        password,
        email: email.trim(),
      });

      setCreated({ username: username.trim(), password });
      setShowCreds(true);
      setUsername('');
      setPassword('');
      setEmail('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create seller account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Add Seller</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Role and department are set automatically: <strong>Seller</strong> + <strong>Executives</strong>.
      </Typography>

      <Stack spacing={2} component="form" onSubmit={handleCreateSeller}>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={submitting}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />
        <TextField
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />

        <Box>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Seller'}
          </Button>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      <Snackbar
        open={showCreds}
        autoHideDuration={10000}
        onClose={() => setShowCreds(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowCreds(false)} severity="info" sx={{ width: '100%' }}>
          Seller created. Share credentials securely:
          <br />Username: {created.username}
          <br />Password: {created.password}
        </Alert>
      </Snackbar>
    </Paper>
  );
}

