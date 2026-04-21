import { useState } from 'react';
import {
  Box, Button, Stack, TextField, Typography,
  InputAdornment, IconButton, Alert, Fade,
} from '@mui/material';
import { Visibility, VisibilityOff, CheckCircle } from '@mui/icons-material';
import api from '../lib/api.js';
import { BRAND_DARK, BRAND_DARK_ALT, BRAND_DARK_DEEP, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../constants/brandTheme';

const brandFeatures = [
  'Analytics & Order Reporting',
  'Listing & Template Management',
  'Order Fulfilment Tracking',
  'Employee & Role Management',
];

function BrandMark({ size = 'md' }) {
  const fontSize = size === 'sm' ? '1.2rem' : '1.35rem';
  const iconSize = size === 'sm' ? 18 : 20;
  return (
    <Box sx={{
      background: `linear-gradient(135deg, ${BRAND_YELLOW} 0%, ${BRAND_YELLOW_DARK} 100%)`,
      borderRadius: 2.5, px: size === 'sm' ? 3 : 3.5, py: '13px',
      boxShadow: '0 6px 28px rgba(245,200,66,0.32)',
      display: 'inline-block',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mb: 0.4 }}>
        <Box component="span" sx={{
          display: 'inline-block', width: iconSize, height: iconSize,
          borderTop: '2.5px solid #4a4a6a', borderLeft: '2.5px solid #4a4a6a',
          borderRadius: '2px 0 0 0', flexShrink: 0,
        }} />
        <Typography sx={{
          fontSize, fontWeight: 800, color: '#3a3a5c',
          letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1,
        }}>
          Grow Mentality
        </Typography>
      </Box>
      <Typography sx={{
        fontSize: '0.62rem', color: '#6a6a8a', letterSpacing: '0.20em', textTransform: 'uppercase',
      }}>
        Nurture Proper For The Future
      </Typography>
    </Box>
  );
}

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      onLogin(data.token, data.user);
    } catch (e) {
      const errorMessage = e?.response?.data?.error || e.message || 'Login failed';
      console.error('Login error:', e);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Fade in timeout={420}>
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>

      {/* ── Left brand panel (desktop only) ─────────────────────────── */}
      <Box sx={{
        display: { xs: 'none', md: 'flex' },
        width: '42%', flexShrink: 0,
        background: `linear-gradient(160deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 60%, ${BRAND_DARK_DEEP} 100%)`,
        flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        p: 6, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <Box sx={{
          position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,200,66,0.15) 0%, transparent 70%)', pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute', bottom: -100, left: -80, width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,200,66,0.08) 0%, transparent 70%)', pointerEvents: 'none',
        }} />

        <Box sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 340 }}>
          <Box sx={{ mb: 5 }}>
            <BrandMark />
          </Box>

          <Typography variant="h4" fontWeight={800} sx={{ color: '#ffffff', mb: 1.5, lineHeight: 1.2 }}>
            Employee Management{' '}
            <Box component="span" sx={{ color: BRAND_YELLOW }}>System</Box>
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.50)', mb: 4, lineHeight: 1.8 }}>
            Everything your team needs in one unified platform.
          </Typography>

          <Stack spacing={1.5}>
            {brandFeatures.map(f => (
              <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CheckCircle sx={{ color: BRAND_YELLOW, fontSize: 18, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 500 }}>
                  {f}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* ── Right form panel ─────────────────────────────────────────── */}
      <Box sx={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(150deg, #f7f9ff 0%, #fffdf0 100%)',
        p: { xs: 3, sm: 5 },
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative blob */}
        <Box sx={{
          position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,200,66,0.14) 0%, transparent 70%)', pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute', bottom: -80, left: -40, width: 260, height: 260, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(25,118,210,0.07) 0%, transparent 70%)', pointerEvents: 'none',
        }} />

        <Box sx={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

          {/* Mobile-only brand header */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 4 }}>
            <BrandMark size="sm" />
          </Box>

          {/* Form card */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              background: '#ffffff',
              borderRadius: 4,
              p: { xs: '28px 24px', sm: '36px 40px' },
              boxShadow: '0 4px 40px rgba(0,0,0,0.10), 0 1px 6px rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <Typography variant="h5" fontWeight={800} sx={{ color: BRAND_DARK, mb: 0.5 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" sx={{ color: '#8a8aaa', mb: 3.5 }}>
              Sign in to your account
            </Typography>

            <Stack spacing={2.5}>
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                fullWidth
                autoComplete="username"
                size="medium"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                autoComplete="current-password"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPassword(v => !v)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {error && (
                <Alert severity="error" sx={{ py: 0.5, borderRadius: 2 }}>{error}</Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{
                  mt: 0.5, py: 1.5, borderRadius: 2,
                  fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.06em',
                  background: BRAND_DARK, color: BRAND_YELLOW,
                  boxShadow: '0 4px 18px rgba(26,26,46,0.28)',
                  '&:hover': {
                    background: BRAND_DARK_ALT,
                    boxShadow: '0 6px 24px rgba(26,26,46,0.38)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? 'Signing in…' : 'Login'}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 3, color: '#a0a0b8' }}>
            © {new Date().getFullYear()} Grow Mentality · Authorized personnel only
          </Typography>
        </Box>
      </Box>
    </Box>
    </Fade>
  );
}



