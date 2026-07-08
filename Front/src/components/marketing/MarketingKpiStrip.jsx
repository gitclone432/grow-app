import { Box, Grid, Paper, Typography } from '@mui/material';

function countByKey(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(keyFn(row) || '').trim() || 'UNKNOWN';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function resolveTypeOptions(typeOptions = []) {
  return typeOptions
    .map((opt) => {
      if (typeof opt === 'string') return { value: opt, label: opt };
      return { value: opt?.value, label: opt?.label || opt?.value };
    })
    .filter((opt) => opt.value);
}

function buildRunningByType({ rows, statusKey, typeKey, typeOptions = [] }) {
  const runningRows = rows.filter(
    (row) => String(row?.[statusKey] || '').toUpperCase() === 'RUNNING',
  );
  const counts = countByKey(runningRows, (row) => row?.[typeKey]);
  const options = resolveTypeOptions(typeOptions);

  const byType = options.map(({ value, label }) => ({
    key: value,
    label,
    count: counts.get(value) || 0,
  }));

  const extraKeys = [...counts.keys()].filter((key) => !options.some((opt) => opt.value === key));
  for (const key of extraKeys.sort()) {
    byType.push({ key, label: key, count: counts.get(key) || 0 });
  }

  return byType;
}

/**
 * KPI strip for Ads & Marketing tabs — one card per type, running items only.
 */
export default function MarketingKpiStrip({
  rows = [],
  loading = false,
  statusKey = 'status',
  typeKey = 'type',
  typeLabel = 'Type',
  entityLabel = 'items',
  typeOptions = [],
}) {
  const list = Array.isArray(rows) ? rows : [];
  const byType = buildRunningByType({
    rows: list,
    statusKey,
    typeKey,
    typeOptions,
  });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Running {entityLabel} by {typeLabel.toLowerCase()}
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : byType.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No types configured</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {byType.map(({ key, label, count }) => (
            <Grid item xs={6} sm={3} key={key}>
              <TypeKpiCard
                label={label}
                value={count.toLocaleString()}
                active={count > 0}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Paper>
  );
}

function TypeKpiCard({ label, value, active }) {
  return (
    <Box
      sx={{
        height: '100%',
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: active ? 'success.light' : 'divider',
        bgcolor: active ? 'rgba(46, 125, 50, 0.06)' : 'grey.50',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,
          lineHeight: 1.2,
          color: active ? 'success.main' : 'text.primary',
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Running
      </Typography>
    </Box>
  );
}
