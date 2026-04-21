
import { useState } from 'react';
import { Box, Button, Typography, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import BarChartIcon from '@mui/icons-material/BarChart';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
import { BRAND_DARK, BRAND_YELLOW, BRAND_YELLOW_DARK } from '../constants/brandTheme';

const features = [
  { icon: <BarChartIcon sx={{ fontSize: 17 }} />, label: 'Analytics & Reporting' },
  { icon: <InventoryIcon sx={{ fontSize: 17 }} />, label: 'Listing Management' },
  { icon: <LocalShippingIcon sx={{ fontSize: 17 }} />, label: 'Order Fulfilment' },
  { icon: <PeopleIcon sx={{ fontSize: 17 }} />, label: 'Team Management' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const handleLogin = () => {
    setLeaving(true);
    setTimeout(() => navigate('/login'), 320);
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(150deg, #f7f9ff 0%, #fffdf0 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      opacity: leaving ? 0 : 1,
      transform: leaving ? 'translateY(-14px) scale(0.98)' : 'translateY(0) scale(1)',
      transition: 'opacity 0.32s ease, transform 0.32s ease',
    }}>

      {/* Decorative blobs */}
      <Box sx={{
        position: 'absolute', top: -120, right: -120,
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,200,66,0.22) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <Box sx={{
        position: 'absolute', bottom: -120, left: -100,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(25,118,210,0.10) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <Box sx={{
        position: 'absolute', top: '45%', left: '3%',
        width: 180, height: 180, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,200,66,0.09) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Main content */}
      <Box sx={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        py: 8, px: 3,
      }}>
        <Box sx={{ maxWidth: 620, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>

          {/* Brand mark */}
          <Box sx={{ display: 'inline-block', mb: 5 }}>
            <Box sx={{
              background: `linear-gradient(135deg, ${BRAND_YELLOW} 0%, ${BRAND_YELLOW_DARK} 100%)`,
              borderRadius: 3, px: 4, py: 2,
              boxShadow: '0 8px 40px rgba(245,200,66,0.42), 0 2px 8px rgba(0,0,0,0.08)',
              display: 'inline-block',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', mb: 0.5 }}>
                <Box component="span" sx={{
                  display: 'inline-block', width: 20, height: 20,
                  borderTop: '2.5px solid #4a4a6a', borderLeft: '2.5px solid #4a4a6a',
                  borderRadius: '3px 0 0 0', flexShrink: 0,
                }} />
                <Typography sx={{
                  fontSize: '1.45rem', fontWeight: 800, color: '#3a3a5c',
                  letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1,
                }}>
                  Grow Mentality
                </Typography>
              </Box>
              <Typography sx={{
                fontSize: '0.64rem', color: '#6a6a8a',
                letterSpacing: '0.22em', textTransform: 'uppercase',
              }}>
                Nurture Proper For The Future
              </Typography>
            </Box>
          </Box>

          {/* Headline */}
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ color: BRAND_DARK, mb: 2, lineHeight: 1.18, fontSize: { xs: '1.85rem', md: '2.5rem' } }}
          >
            Manage your team,{' '}
            <Box component="span" sx={{
              color: '#b8860b',
              borderBottom: `3px solid ${BRAND_YELLOW}`,
              pb: '2px',
            }}>
              smarter
            </Box>
          </Typography>

          <Typography sx={{
            color: '#5a5a7a', mb: 5, lineHeight: 1.8, maxWidth: 480, mx: 'auto', fontSize: '1.05rem',
          }}>
            A unified platform for listings, analytics, order fulfilment, and team management
            — built for Grow Mentality.
          </Typography>

          {/* Feature chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mb: 5.5 }}>
            {features.map(f => (
              <Chip
                key={f.label}
                icon={f.icon}
                label={f.label}
                sx={{
                  height: 36, px: 0.5,
                  bgcolor: '#ffffff',
                  fontWeight: 500, fontSize: '0.82rem', color: '#3a3a5c',
                  border: '1px solid rgba(0,0,0,0.10)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  '& .MuiChip-icon': { color: '#b8860b' },
                }}
              />
            ))}
          </Box>

          {/* CTA */}
          <Button
            variant="contained"
            size="large"
            onClick={handleLogin}
            sx={{
              px: 7, py: 1.8, borderRadius: 3,
              fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em',
              background: BRAND_DARK, color: BRAND_YELLOW,
              boxShadow: '0 6px 28px rgba(26,26,46,0.30)',
              '&:hover': {
                background: '#252540',
                boxShadow: '0 8px 36px rgba(26,26,46,0.42)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.22s ease',
            }}
          >
            Login to Dashboard
          </Button>

          <Typography variant="caption" sx={{ display: 'block', mt: 2.5, color: '#a0a0b8', letterSpacing: '0.03em' }}>
            Authorized personnel only
          </Typography>
        </Box>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 2.5, textAlign: 'center', borderTop: '1px solid rgba(0,0,0,0.07)', position: 'relative', zIndex: 1 }}>
        <Typography variant="caption" sx={{ color: '#b0b0c0', letterSpacing: '0.04em' }}>
          © {new Date().getFullYear()} Grow Mentality · Employee Management System
        </Typography>
      </Box>
    </Box>
  );
}


