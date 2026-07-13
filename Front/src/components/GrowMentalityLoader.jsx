import { Box, Typography } from '@mui/material';
import { BRAND_DARK, BRAND_YELLOW } from '../constants/brandTheme';

export default function GrowMentalityLoader({
  label = 'Grow Mentality',
  fullPage = false,
  minHeight = 320,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullPage ? '100vh' : minHeight,
        bgcolor: fullPage ? '#f0f2f5' : 'transparent',
        gap: 2.5,
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          border: '5px solid',
          borderColor: BRAND_YELLOW,
          borderTopColor: BRAND_DARK,
          borderRadius: '50%',
          animation: 'gm-spin 0.75s linear infinite',
          '@keyframes gm-spin': {
            to: { transform: 'rotate(360deg)' },
          },
        }}
      />
      <Typography
        sx={{
          fontSize: '1.1rem',
          fontWeight: 600,
          color: BRAND_DARK,
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
