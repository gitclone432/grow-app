import { Paper, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { BRAND_DARK } from '../constants/brandTheme.js';
import { dashboardSignatureTokens } from '../theme/appTheme.js';

/**
 * SectionCard
 * Standardised surface card — wraps MUI Paper with the shared radius, border,
 * shadow and background from the dashboard design system.
 *
 * Usage:
 *   <SectionCard sx={{ p: 2.5 }}>...</SectionCard>
 *   <SectionCard emphasized sx={{ p: 2, mb: 2 }}>...</SectionCard>
 *
 * Props:
 *   children    — card content
 *   emphasized  — boolean; applies slightly elevated shadow (default: false)
 *   sx          — optional sx overrides
 *   ...props    — forwarded to MUI Paper
 */
export default function SectionCard({ children, emphasized = false, sx, ...props }) {
  const theme = useTheme();
  const dashboardTheme = theme.customTokens?.dashboardSignature || dashboardSignatureTokens;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: `${dashboardTheme.radius.card}px`,
        border: '1px solid',
        borderColor: alpha(BRAND_DARK, 0.08),
        backgroundColor: theme.palette.background.paper,
        boxShadow: emphasized
          ? dashboardTheme.shadows.table
          : dashboardTheme.shadows.card,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
}
