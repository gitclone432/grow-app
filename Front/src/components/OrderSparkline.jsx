import { Box, Stack, Tooltip } from '@mui/material';

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

// 12-month order-count sparkline: single hue, baseline-anchored bars,
// per-month tooltip; zero months render as a light stub so the timeline
// stays readable.
export default function OrderSparkline({ monthly = [] }) {
  if (!monthly.length) return null;
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <Stack
      direction="row"
      spacing="2px"
      alignItems="flex-end"
      sx={{ height: 26, px: 0.5 }}
      aria-label="Orders per month, last 12 months"
    >
      {monthly.map((m) => (
        <Tooltip key={m.month} title={`${formatMonthLabel(m.month)}: ${m.count} order${m.count === 1 ? '' : 's'}`}>
          <Box
            sx={{
              width: 7,
              height: m.count ? Math.max(4, Math.round((m.count / max) * 24)) : 2,
              bgcolor: m.count ? '#2563eb' : '#e2e8f0',
              borderRadius: '1px 1px 0 0'
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}
