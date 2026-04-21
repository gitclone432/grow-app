import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function OrdersDashboardSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{ p: 3 }}>
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box>
          <Skeleton variant="text" width={340} height={40} />
          <Skeleton variant="text" width={280} height={20} />
        </Box>
        <Skeleton variant="text" width={180} height={16} />
      </Stack>

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 2 }} elevation={0}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Skeleton variant="rounded" width={180} height={40} />
          <Skeleton variant="rounded" width={220} height={40} />
          <Skeleton variant="rounded" width={120} height={32} />
          <Skeleton variant="rounded" width={90} height={36} />
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1}>
            {[80, 90, 70, 100].map((w, i) => (
              <Skeleton key={i} variant="rounded" width={w} height={30} />
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* 6 KPI cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, mb: 2 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={100}
            sx={{ borderRadius: 2, opacity: 1 - i * 0.06 }}
          />
        ))}
      </Box>

      {/* Top blockers bar */}
      <Paper sx={{ p: 1.5, mb: 2 }} elevation={0}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Skeleton variant="text" width={100} height={22} />
          {[140, 160, 130].map((w, i) => (
            <Skeleton key={i} variant="rounded" width={w} height={28} sx={{ borderRadius: 4 }} />
          ))}
        </Stack>
      </Paper>

      {/* Chart area */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Box>

      {/* Table */}
      <Skeleton variant="rounded" height={48} sx={{ mb: '2px', borderRadius: 1 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={44} sx={{ mb: '2px', opacity: 1 - i * 0.08 }} />
      ))}
    </Box>
    </Fade>
  );
}
