import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function AwaitingShipmentSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 100px)',
      overflow: 'hidden',
      width: '100%',
      p: 3,
    }}>
      <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Skeleton variant="text" width={220} height={36} />
          <Skeleton variant="rounded" width={110} height={28} sx={{ borderRadius: 4 }} />
        </Stack>

        <Skeleton variant="rectangular" height={1} sx={{ mb: 2 }} />

        {/* Filter section */}
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Skeleton variant="rounded" width={200} height={40} />
            <Skeleton variant="rounded" width={150} height={40} />
            <Skeleton variant="rounded" width={150} height={40} />
            <Skeleton variant="rounded" width={150} height={40} />
            <Skeleton variant="rounded" width={160} height={40} />
            <Skeleton variant="rounded" width={180} height={40} />
          </Stack>
        </Box>
      </Paper>

      {/* Table area */}
      <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Skeleton variant="rounded" height={48} sx={{ mx: 1, mt: 1, mb: '2px', borderRadius: 1 }} />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={52}
            sx={{ mx: 1, mb: '2px', borderRadius: 1, opacity: 1 - i * 0.06 }}
          />
        ))}
        <Box sx={{ mt: 'auto', p: 1.5, display: 'flex', justifyContent: 'center' }}>
          <Skeleton variant="rounded" width={300} height={32} sx={{ borderRadius: 4 }} />
        </Box>
      </Paper>
    </Box>
    </Fade>
  );
}
