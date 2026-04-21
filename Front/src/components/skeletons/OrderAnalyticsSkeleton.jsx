import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function OrderAnalyticsSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{ p: 3 }}>
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box>
          <Skeleton variant="text" width={360} height={42} />
          <Skeleton variant="text" width={420} height={20} />
        </Box>
        <Skeleton variant="rounded" width={160} height={36} sx={{ borderRadius: 4 }} />
      </Stack>

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 3 }} elevation={0}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Skeleton variant="rounded" width={180} height={36} />
          <Skeleton variant="rounded" width={150} height={40} />
          <Skeleton variant="rounded" width={200} height={40} />
          <Skeleton variant="rounded" width={200} height={40} />
          <Skeleton variant="rounded" width={120} height={32} />
          <Skeleton variant="rounded" width={90} height={36} />
        </Stack>
      </Paper>

      {/* Data table */}
      <Skeleton variant="rounded" height={52} sx={{ mb: '2px', borderRadius: 1 }} />
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={44} sx={{ mb: '2px', opacity: 1 - i * 0.06 }} />
      ))}
    </Box>
    </Fade>
  );
}
