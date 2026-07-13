import { CircularProgress, Switch, Tooltip } from '@mui/material';

export default function MarketingAutoExtendToggle({
  checked = false,
  disabled = false,
  loading = false,
  onChange,
}) {
  return (
    <Tooltip title="Auto-extend 1 month when ending within 5 days">
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {loading ? (
          <CircularProgress size={18} sx={{ mx: 1 }} />
        ) : (
          <Switch
            size="small"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange?.(event.target.checked)}
            inputProps={{ 'aria-label': 'Auto-extend when ending soon' }}
          />
        )}
      </span>
    </Tooltip>
  );
}
