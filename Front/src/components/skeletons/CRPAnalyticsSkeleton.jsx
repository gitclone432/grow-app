import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function CRPAnalyticsSkeleton() {
  return (
    <Fade in timeout={200}>
      <Box sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', xl: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Skeleton variant="text" width={180} height={38} />
            <Skeleton variant="text" width={260} height={20} />
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Skeleton variant="rounded" width={130} height={40} />
            <Skeleton variant="rounded" width={158} height={40} />
            <Skeleton variant="rounded" width={170} height={40} />
            <Skeleton variant="rounded" width={200} height={36} sx={{ borderRadius: 1 }} />
            <Skeleton variant="rounded" width={90} height={40} />
          </Stack>
        </Stack>

        <Skeleton variant="text" width={140} height={18} sx={{ mb: 1 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5, mb: 3 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Paper key={i} sx={{ p: 2, borderRadius: 2 }} elevation={0}>
              <Skeleton variant="rounded" width={36} height={36} sx={{ mb: 1.5 }} />
              <Skeleton variant="text" width="60%" height={16} />
              <Skeleton variant="text" width="40%" height={32} />
            </Paper>
          ))}
        </Box>

        <Skeleton variant="text" width={180} height={18} sx={{ mb: 1 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5, mb: 3 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Paper key={i} sx={{ p: 2, borderRadius: 2 }} elevation={0}>
              <Skeleton variant="rounded" width={40} height={40} sx={{ mb: 1.5 }} />
              <Skeleton variant="text" width="70%" height={16} />
              <Skeleton variant="text" width="35%" height={32} />
            </Paper>
          ))}
        </Box>

        <Skeleton variant="text" width={220} height={18} sx={{ mb: 1 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
        </Box>
      </Box>
    </Fade>
  );
}
