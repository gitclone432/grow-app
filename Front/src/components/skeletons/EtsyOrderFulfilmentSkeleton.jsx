import { Box, Fade, Paper, Skeleton, Stack } from '@mui/material';

export default function EtsyOrderFulfilmentSkeleton() {
  return (
    <Fade in timeout={200}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 64px)', md: 'calc(100vh - 100px)' },
          overflow: 'hidden',
          width: '100%',
          px: { xs: 0.5, sm: 1, md: 0 },
        }}
      >
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Skeleton variant="circular" width={24} height={24} />
              <Skeleton variant="text" width={200} height={34} />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Skeleton variant="rounded" width={90} height={28} sx={{ borderRadius: 4 }} />
              <Skeleton variant="rounded" width={100} height={32} />
              <Skeleton variant="rounded" width={90} height={32} />
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
            <Skeleton variant="rounded" width={200} height={40} />
            <Skeleton variant="rounded" width={180} height={40} />
            <Skeleton variant="rounded" width={100} height={36} />
          </Stack>
        </Paper>

        <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Skeleton variant="rounded" height={72} sx={{ mx: 1, mt: 1, mb: '2px', borderRadius: 1 }} />
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={52}
              sx={{ mx: 1, mb: '2px', borderRadius: 1, opacity: 1 - i * 0.05 }}
            />
          ))}
        </Paper>
      </Box>
    </Fade>
  );
}
