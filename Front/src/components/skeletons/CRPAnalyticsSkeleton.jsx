import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function CRPAnalyticsSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{ p: 3 }}>
      {/* Header + inline filters */}
      <Stack direction={{ xs: 'column', xl: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Skeleton variant="text" width={300} height={38} />
          <Skeleton variant="text" width={260} height={20} />
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Skeleton variant="rounded" width={130} height={40} />
          <Skeleton variant="rounded" width={158} height={40} />
          <Skeleton variant="rounded" width={170} height={40} />
          <Skeleton variant="rounded" width={200} height={36} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rounded" width={100} height={32} />
          <Skeleton variant="rounded" width={90} height={36} />
        </Stack>
      </Stack>

      {/* Stat cards row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Paper key={i} sx={{ p: 2, borderRadius: 2 }} elevation={0}>
            <Skeleton variant="circular" width={28} height={28} sx={{ mb: 1 }} />
            <Skeleton variant="text" width="60%" height={16} />
            <Skeleton variant="text" width="40%" height={32} />
            <Skeleton variant="text" width="80%" height={14} sx={{ mt: 0.5 }} />
          </Paper>
        ))}
      </Box>

      {/* Bar chart area */}
      <Skeleton variant="rounded" height={300} sx={{ borderRadius: 2, mb: 3 }} />

      {/* Donut chart + breakdown */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
        <Box>
          <Skeleton variant="rounded" height={44} sx={{ mb: '2px' }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={40} sx={{ mb: '2px', opacity: 1 - i * 0.1 }} />
          ))}
        </Box>
      </Box>
    </Box>
    </Fade>
  );
}
