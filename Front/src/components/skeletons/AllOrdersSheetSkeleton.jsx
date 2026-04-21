import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function AllOrdersSheetSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{ p: 3 }}>
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Skeleton variant="text" width={280} height={42} />
        <Stack direction="row" spacing={2}>
          <Skeleton variant="rounded" width={170} height={36} />
          <Skeleton variant="rounded" width={160} height={36} />
          <Skeleton variant="rounded" width={100} height={36} />
        </Stack>
      </Stack>

      {/* Controls bar */}
      <Paper sx={{ p: 2, mb: 2 }} elevation={0}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton variant="rounded" width={200} height={40} />
          <Skeleton variant="rounded" width={160} height={40} />
          <Skeleton variant="rounded" width={120} height={32} />
        </Stack>
      </Paper>

      {/* Wide table — many columns */}
      <Skeleton variant="rounded" height={48} sx={{ mb: '2px', borderRadius: 1 }} />
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton
          key={i}
          variant="rounded"
          height={46}
          sx={{ mb: '2px', borderRadius: 1, opacity: 1 - i * 0.05 }}
        />
      ))}

      {/* Pagination */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <Skeleton variant="rounded" width={300} height={32} sx={{ borderRadius: 4 }} />
      </Box>
    </Box>
    </Fade>
  );
}
