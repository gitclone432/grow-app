import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function AmazonArrivalsSkeleton() {
  return (
    <Fade in timeout={200}>
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      p: 3,
      overflow: 'hidden',
    }}>
      {/* Title */}
      <Skeleton variant="text" width={200} height={36} sx={{ mb: 2 }} />

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }} elevation={0}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Skeleton variant="rounded" width={200} height={40} />
          <Skeleton variant="rounded" width={170} height={40} />
          <Skeleton variant="rounded" width={170} height={40} />
          <Skeleton variant="rounded" width={200} height={40} sx={{ flex: { xs: 'none', sm: 1 } }} />
          <Skeleton variant="rounded" width={150} height={40} />
          <Skeleton variant="rounded" width={200} height={40} />
          <Skeleton variant="rounded" width={100} height={36} />
        </Stack>
      </Paper>

      {/* Table area */}
      <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Skeleton variant="rounded" height={48} sx={{ mx: 1, mt: 1, mb: '2px', borderRadius: 1 }} />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={48}
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
