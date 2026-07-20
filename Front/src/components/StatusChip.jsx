import { Box, Typography } from '@mui/material';
import { dashboardSignatureTokens } from '../theme/appTheme.js';

/**
 * StatusChip
 * A tone-aware inline status indicator driven by the dashboard token system.
 * Replaces manually-styled <Box component="span"> tone pills scattered across pages.
 *
 * Usage:
 *   <StatusChip label="Shipped" tone="success" />
 *   <StatusChip label="Pending" tone="warning" size="small" />
 *   <StatusChip label={count} tone="danger" />
 *
 * Props:
 *   label   — content to display (string | number | node)
 *   tone    — key from dashboardSignatureTokens.tones
 *             ('neutral' | 'info' | 'success' | 'warning' | 'danger' | 'amazon' | 'shipping')
 *   size    — 'small' | 'medium' (default: 'medium')
 *   sx      — optional sx overrides
 */
export default function StatusChip({ label, tone = 'neutral', size = 'medium', sx }) {
  const palette = dashboardSignatureTokens.tones[tone] || dashboardSignatureTokens.tones.neutral;
  const isSmall = size === 'small';

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: isSmall ? 1 : 1.25,
        py: isSmall ? 0.3 : 0.5,
        borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
        backgroundColor: palette.background,
        border: '1px solid',
        borderColor: palette.border,
        color: palette.color,
        fontWeight: 700,
        fontSize: isSmall ? '0.75rem' : '0.875rem',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {label}
    </Box>
  );
}
