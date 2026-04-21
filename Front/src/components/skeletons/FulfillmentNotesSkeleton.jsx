import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function FulfillmentNotesSkeleton() {
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
          <Stack direction="row" spacing={2} alignItems="center">
            <Skeleton variant="circular" width={24} height={24} />
            <Skeleton variant="text" width={300} height={36} />
          </Stack>
          <Skeleton variant="rounded" width={100} height={28} sx={{ borderRadius: 4 }} />
        </Stack>

        <Skeleton variant="rectangular" height={1} sx={{ mb: 2 }} />

        {/* Filters */}
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Skeleton variant="rounded" width={200} height={40} />
            <Skeleton variant="rounded" width={150} height={40} />
            <Skeleton variant="rounded" width={80} height={36} />
          </Stack>
        </Box>
      </Paper>

      {/* Table area */}
      <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Skeleton variant="rounded" height={48} sx={{ mx: 1, mt: 1, mb: '2px', borderRadius: 1 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={56}
            sx={{ mx: 1, mb: '2px', borderRadius: 1, opacity: 1 - i * 0.07 }}
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
