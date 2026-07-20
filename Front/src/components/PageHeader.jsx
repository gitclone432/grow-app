import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import { BRAND_DARK } from '../constants/brandTheme.js';

/**
 * PageHeader
 * Standardised page title area with optional breadcrumbs, subtitle and action slot.
 *
 * Usage:
 *   // Minimal
 *   <PageHeader title="Orders Dashboard" />
 *
 *   // With subtitle and action buttons
 *   <PageHeader
 *     title="All Orders"
 *     subtitle="Showing fulfilment view"
 *     actions={<Button variant="contained">Export</Button>}
 *   />
 *
 *   // With breadcrumbs
 *   <PageHeader
 *     title="Template Listings"
 *     breadcrumbs={[
 *       { label: 'Listing & Research' },
 *       { label: 'Template Listing' },
 *       { label: 'My Template' },
 *     ]}
 *   />
 *
 * Props:
 *   title        — page title string (required)
 *   subtitle     — secondary descriptor shown below title
 *   breadcrumbs  — array of { label, href? } objects; href makes the item a link
 *   actions      — React node(s) rendered in the right-side action area
 *   sx           — optional sx overrides on the outer wrapper
 */
export default function PageHeader({ title, subtitle, breadcrumbs, actions, sx }) {
  return (
    <Box sx={{ pt: { xs: 2, md: 2.5 }, pb: 2, ...sx }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs sx={{ mb: 0.75 }}>
          {breadcrumbs.map((crumb, i) =>
            crumb.href ? (
              <Link
                key={i}
                href={crumb.href}
                underline="hover"
                color="inherit"
                sx={{ fontSize: '0.8rem' }}
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography
                key={i}
                sx={{ fontSize: '0.8rem', color: i === breadcrumbs.length - 1 ? 'text.primary' : 'inherit' }}
              >
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}

      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1.5}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: BRAND_DARK, lineHeight: 1.3 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
