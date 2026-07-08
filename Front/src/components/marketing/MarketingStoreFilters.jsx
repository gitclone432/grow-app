import { FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import {
  ALL_MARKETPLACES_VALUE,
  ALL_STORES_VALUE,
  MARKETPLACES,
} from '../../lib/marketingConstants';

export default function MarketingStoreFilters({
  sellers = [],
  sellerId,
  onSellerChange,
  marketplace,
  onMarketplaceChange,
  disabled = false,
}) {
  return (
    <>
      <Grid item xs={12} sm={6} md={4}>
        <FormControl fullWidth size="small">
          <InputLabel>Store</InputLabel>
          <Select
            label="Store"
            value={sellerId}
            disabled={disabled}
            onChange={(e) => onSellerChange(e.target.value)}
          >
            <MenuItem value={ALL_STORES_VALUE}>All Stores</MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s._id} value={s._id}>
                {s.user?.username || s.user?.email || s._id}
                {s.user?.active === false ? ' (inactive user)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <FormControl fullWidth size="small">
          <InputLabel>Marketplace</InputLabel>
          <Select
            label="Marketplace"
            value={marketplace}
            disabled={disabled}
            onChange={(e) => onMarketplaceChange(e.target.value)}
          >
            <MenuItem value={ALL_MARKETPLACES_VALUE}>All Marketplaces</MenuItem>
            {MARKETPLACES.map((mp) => (
              <MenuItem key={mp} value={mp}>{mp}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
    </>
  );
}
