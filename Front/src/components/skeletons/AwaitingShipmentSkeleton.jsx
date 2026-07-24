import { Box, Fade, Skeleton, Stack } from '@mui/material';
import SectionCard from '../SectionCard.jsx';

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
        <SectionCard sx={{ p: 2, mb: 2, flexShrink: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Skeleton variant="text" width={220} height={36} />
            <Skeleton variant="rounded" width={120} height={28} sx={{ borderRadius: 4 }} />
          </Stack>

          <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Skeleton variant="rounded" width={200} height={40} />
              <Skeleton variant="rounded" width={150} height={40} />
              <Skeleton variant="rounded" width={150} height={40} />
              <Skeleton variant="rounded" width={150} height={40} />
              <Skeleton variant="rounded" width={160} height={40} />
              <Skeleton variant="rounded" width={160} height={40} />
              <Skeleton variant="rounded" width={160} height={40} />
              <Skeleton variant="rounded" width={160} height={40} />
              <Skeleton variant="rounded" width={180} height={40} />
              <Skeleton variant="rounded" width={150} height={40} />
            </Stack>
          </Box>

          <Skeleton variant="text" width={220} height={18} />
        </SectionCard>

        <SectionCard sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 0 }}>
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Skeleton variant="rounded" height={48} sx={{ borderRadius: 1 }} />
          </Box>
          <Box sx={{ px: 2, pb: 2, flex: 1 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={52}
                sx={{ mb: '2px', borderRadius: 1, opacity: 1 - i * 0.06 }}
              />
            ))}
          </Box>
        </SectionCard>

        <SectionCard sx={{ py: 1, px: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexShrink: 0, mt: 2 }}>
          <Skeleton variant="text" width={220} height={20} />
          <Skeleton variant="rounded" width={220} height={32} sx={{ borderRadius: 4 }} />
        </SectionCard>
      </Box>
    </Fade>
  );
}
