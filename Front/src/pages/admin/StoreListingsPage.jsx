import { useEffect, useRef, useState, Suspense } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
import { ALL_MARKETPLACES_VALUE, ALL_STORES_VALUE } from '../../lib/marketingConstants.js';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';
import { lazyWithRetry as lazy } from '../../lib/lazyImport.js';

const StoreListingsInventoryPage = lazy(() => import('./StoreListingsInventoryPage.jsx'));
const MarketingListingRecommendationsPage = lazy(() => import('./MarketingListingRecommendationsPage.jsx'));

export default function StoreListingsPage() {
  const [tab, setTab] = useState('listings');
  const [recommendationsMounted, setRecommendationsMounted] = useState(false);
  const recommendationsRef = useRef(null);
  const [recommendationsToolbar, setRecommendationsToolbar] = useState({
    loading: false,
    refreshDisabled: true,
  });
  const { sellers, loading: sellersLoading } = useEbayConnectedSellers();
  const [sellerId, setSellerId] = useState(ALL_STORES_VALUE);
  const [marketplace, setMarketplace] = useState(ALL_MARKETPLACES_VALUE);

  useEffect(() => {
    if (tab === 'recommendations') setRecommendationsMounted(true);
  }, [tab]);

  useEffect(() => {
    void import('./StoreListingsInventoryPage.jsx');
    void import('./MarketingListingRecommendationsPage.jsx');
  }, []);

  const recommendationsTabProps = {
    embedded: true,
    active: tab === 'recommendations',
    sellers,
    sellerId,
    onSellerChange: setSellerId,
    marketplace,
    onMarketplaceChange: setMarketplace,
  };

  return (
    <Box sx={{ pb: 3 }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
              Store Listings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Synced inventory across stores and eBay Promoted Listings recommendations.
            </Typography>
          </Box>
        </Stack>

        {tab === 'recommendations' ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <MarketingStoreFilters
                sellers={sellers}
                sellerId={sellerId}
                onSellerChange={setSellerId}
                marketplace={marketplace}
                onMarketplaceChange={setMarketplace}
                disabled={sellersLoading || sellers.length === 0}
              />
            </Grid>
          </Paper>
        ) : null}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
          sx={{
            mb: 0,
            gap: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ minHeight: 42, flex: 1 }}
          >
            <Tab value="listings" label="Listings" />
            <Tab value="recommendations" label="Recommendations" />
          </Tabs>

          {tab === 'recommendations' ? (
            <Stack direction="row" spacing={1} sx={{ pb: { xs: 1, sm: 0.5 }, flexShrink: 0 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => recommendationsRef.current?.refresh()}
                disabled={recommendationsToolbar.refreshDisabled}
              >
                Refresh
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Box>

      <Suspense
        fallback={(
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      >
        <Box sx={{ display: tab === 'listings' ? 'block' : 'none' }}>
          <StoreListingsInventoryPage embedded active={tab === 'listings'} />
        </Box>
        <Box sx={{ display: tab === 'recommendations' ? 'block' : 'none' }}>
          {recommendationsMounted ? (
            <MarketingListingRecommendationsPage
              ref={recommendationsRef}
              {...recommendationsTabProps}
              onToolbarState={setRecommendationsToolbar}
            />
          ) : null}
        </Box>
      </Suspense>
    </Box>
  );
}
