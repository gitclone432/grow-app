import { Box, Fade, Skeleton, Stack } from '@mui/material';

export default function OrdersDashboardSkeleton() {
  return (
    <Fade in timeout={200}>
      <Box sx={{ px: { xs: 2, md: 3 }, pb: 3, pt: 0.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Skeleton variant="text" width={260} height={36} />
            <Skeleton variant="text" width={220} height={18} />
          </Box>
          <Skeleton variant="text" width={160} height={16} />
        </Stack>

        <Skeleton variant="rounded" height={56} sx={{ mb: 1.5, borderRadius: 2 }} />

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {[88, 110, 120, 108, 118].map((w) => (
            <Skeleton key={w} variant="rounded" width={w} height={24} sx={{ borderRadius: 4 }} />
          ))}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1.25, mb: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: 2, opacity: 1 - i * 0.05 }} />
          ))}
        </Box>

        <Skeleton variant="rounded" height={44} sx={{ mb: 2, borderRadius: 2 }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.65fr 1fr' }, gap: 2, mb: 2 }}>
          <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
        </Box>
      </Box>
    </Fade>
  );
}
