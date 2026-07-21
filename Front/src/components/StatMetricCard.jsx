import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { dashboardSignatureTokens } from '../theme/appTheme.js';

/**
 * StatMetricCard
 * Unified KPI / metric card for the dashboard design system.
 * Replaces the ad-hoc KpiCard, SummaryCard, and MetricCard components
 * that appear across the order fulfilment pages.
 *
 * Usage:
 *   // Simple metric with tone colouring
 *   <StatMetricCard label="Total Orders" value={142} tone="success" />
 *
 *   // Interactive / filterable card (CRP-style)
 *   <StatMetricCard label="Amazon" value={38} icon={ShoppingCartIcon}
 *     color="#ed6c02" active={activeFilter === 'amazon'}
 *     onClick={() => setActiveFilter('amazon')} />
 *
 *   // Dashboard KPI with navigation link
 *   <StatMetricCard label="Awaiting Shipment" value={12}
 *     tone="warning" actionTo="/awaiting-shipment" actionLabel="View all" />
 *
 * Props:
 *   label       — card title text
 *   value       — primary metric value (string | number | node)
 *   tone        — key from dashboardSignatureTokens.tones; drives border + bg colour
 *                 ('neutral' | 'info' | 'success' | 'warning' | 'danger' | 'amazon' | 'shipping')
 *   color       — raw CSS colour; used when tone system is insufficient (e.g. chart colours)
 *                 If supplied, overrides tone-derived colours for the value box
 *   icon        — MUI SvgIcon component (passed as element type, not instance)
 *   active      — boolean; highlights the card when used as an interactive filter
 *   onClick     — click handler; makes the card interactive
 *   subtext     — secondary caption displayed below the value
 *   actionTo    — react-router path; renders a "view more" link button
 *   actionLabel — label for the action link (default: 'Open')
 *   sx          — optional sx overrides on the outer Paper
 */
export default function StatMetricCard({
  label,
  value,
  tone = 'neutral',
  color,
  icon: Icon,
  active = false,
  onClick,
  subtext,
  actionTo,
  actionLabel,
  sx,
}) {
  const isInteractive = Boolean(onClick);
  const palette = dashboardSignatureTokens.tones[tone] || dashboardSignatureTokens.tones.neutral;

  // When a raw color is supplied (CRP-style), derive active state from it;
  // otherwise fall back to the tone palette.
  const borderColor = active
    ? (color || palette.border)
    : (color ? 'divider' : palette.border);

  const boxShadow = active && color ? `0 0 0 1px ${color}` : 'none';

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2,
        borderRadius: `${dashboardSignatureTokens.radius.card}px`,
        border: '1px solid',
        borderColor,
        background: dashboardSignatureTokens.surfaces.metricCard,
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        boxShadow,
        '&:hover': isInteractive
          ? { borderColor: color || palette.border, transform: 'translateY(-1px)' }
          : undefined,
        '&:focus-visible': isInteractive
          ? { outline: '2px solid', outlineColor: color || palette.border, outlineOffset: '2px' }
          : undefined,
        ...sx,
      }}
    >
      {/* Label row */}
      <Stack direction="row" alignItems="center" spacing={0.75}>
        {Icon && (
          <Icon
            sx={{
              fontSize: 18,
              color: active && color ? color : 'text.secondary',
            }}
          />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Stack>

      {/* Value badge */}
      <Box
        sx={{
          mt: 1.5,
          width: 'fit-content',
          px: 1.25,
          py: 0.5,
          borderRadius: `${dashboardSignatureTokens.radius.pill}px`,
          backgroundColor: color
            ? `${color}1a` /* 10 % alpha of the raw colour */
            : palette.background,
          border: '1px solid',
          borderColor: color || palette.border,
          color: color || palette.color,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>

      {subtext && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtext}
        </Typography>
      )}

      {actionTo && (
        <Button
          size="small"
          component={Link}
          to={actionTo}
          endIcon={<OpenInNewIcon fontSize="small" />}
          sx={{ mt: 1, alignSelf: 'flex-start', p: 0, minWidth: 0 }}
        >
          {actionLabel || 'Open'}
        </Button>
      )}
    </Paper>
  );
}
