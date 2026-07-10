import { useEffect, useRef, useState, lazy, Suspense } from 'react';
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
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import MarketingStoreFilters from '../../components/marketing/MarketingStoreFilters.jsx';
import MarketingEndingSoonAlert from '../../components/marketing/MarketingEndingSoonAlert.jsx';
import { ALL_MARKETPLACES_VALUE, ALL_STORES_VALUE } from '../../lib/marketingConstants.js';
import { useEbayConnectedSellers } from '../../hooks/useEbayConnectedSellers.js';

const MarketingCampaignsPage = lazy(() => import('./MarketingCampaignsPage.jsx'));
const MarketingPromotionsPage = lazy(() => import('./MarketingPromotionsPage.jsx'));
const MarketingAdvertisingEligibilityPage = lazy(() => import('./MarketingAdvertisingEligibilityPage.jsx'));

export default function AdsAndMarketingPage() {
  const [tab, setTab] = useState('promotions');
  const [campaignsMounted, setCampaignsMounted] = useState(false);
  const [eligibilityMounted, setEligibilityMounted] = useState(false);
  const promotionsRef = useRef(null);
  const campaignsRef = useRef(null);
  const eligibilityRef = useRef(null);
  const [promoToolbar, setPromoToolbar] = useState({
    loading: false,
    refreshDisabled: true,
    createDisabled: true,
  });
  const [campaignToolbar, setCampaignToolbar] = useState({
    loading: false,
    refreshDisabled: true,
    createDisabled: true,
  });
  const [eligibilityToolbar, setEligibilityToolbar] = useState({
    loading: false,
    refreshDisabled: true,
  });
  const { sellers, loading: sellersLoading } = useEbayConnectedSellers();
  const [sellerId, setSellerId] = useState(ALL_STORES_VALUE);
  const [marketplace, setMarketplace] = useState(ALL_MARKETPLACES_VALUE);

  useEffect(() => {
    if (tab === 'campaigns') setCampaignsMounted(true);
    if (tab === 'eligibility') setEligibilityMounted(true);
  }, [tab]);

  useEffect(() => {
    void import('./MarketingCampaignsPage.jsx');
    void import('./MarketingPromotionsPage.jsx');
    void import('./MarketingAdvertisingEligibilityPage.jsx');
  }, []);

  const handleSellerChange = (value) => {
    setSellerId(value);
  };

  const sharedTabProps = {
    embedded: true,
    active: tab === 'promotions',
    sellers,
    sellerId,
    onSellerChange: handleSellerChange,
    marketplace,
    onMarketplaceChange: setMarketplace,
  };

  const campaignsTabProps = {
    ...sharedTabProps,
    active: tab === 'campaigns',
  };

  const eligibilityTabProps = {
    ...sharedTabProps,
    active: tab === 'eligibility',
  };

  return (
    <Box sx={{ pb: 3, position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute',
          top: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: 2,
          maxWidth: { xs: 'calc(100% - 32px)', sm: 340 },
        }}
      >
        <MarketingEndingSoonAlert sellerId={sellerId} marketplace={marketplace} />
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
          sx={{ mb: 2, pr: { md: 36 } }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
              Ads and Marketing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Running KPIs, promotions, campaigns, and advertising eligibility in one place.
            </Typography>
          </Box>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2}>
            <MarketingStoreFilters
              sellers={sellers}
              sellerId={sellerId}
              onSellerChange={handleSellerChange}
              marketplace={marketplace}
              onMarketplaceChange={setMarketplace}
              disabled={sellersLoading || sellers.length === 0}
            />
          </Grid>
        </Paper>

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
            <Tab value="promotions" label="Marketing Promotions" />
            <Tab value="campaigns" label="Marketing Campaigns" />
            <Tab value="eligibility" label="Advertising Eligibility" />
          </Tabs>

          <Stack direction="row" spacing={1} sx={{ pb: { xs: 1, sm: 0.5 }, flexShrink: 0 }}>
            {tab === 'promotions' ? (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => promotionsRef.current?.openCreate()}
                  disabled={promoToolbar.createDisabled}
                >
                  Create promotion
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => promotionsRef.current?.refresh()}
                  disabled={promoToolbar.refreshDisabled}
                >
                  Refresh
                </Button>
              </>
            ) : tab === 'campaigns' ? (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => campaignsRef.current?.openCreate()}
                  disabled={campaignToolbar.createDisabled}
                >
                  Create campaign
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => campaignsRef.current?.refresh()}
                  disabled={campaignToolbar.refreshDisabled}
                >
                  Refresh
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => eligibilityRef.current?.refresh()}
                disabled={eligibilityToolbar.refreshDisabled}
              >
                Refresh
              </Button>
            )}
          </Stack>
        </Stack>
      </Box>

      <Suspense
        fallback={(
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      >
        <Box sx={{ display: tab === 'promotions' ? 'block' : 'none' }}>
          <MarketingPromotionsPage
            ref={promotionsRef}
            {...sharedTabProps}
            onToolbarState={setPromoToolbar}
          />
        </Box>
        <Box sx={{ display: tab === 'campaigns' ? 'block' : 'none' }}>
          {campaignsMounted ? (
            <MarketingCampaignsPage
              ref={campaignsRef}
              {...campaignsTabProps}
              onToolbarState={setCampaignToolbar}
            />
          ) : null}
        </Box>
        <Box sx={{ display: tab === 'eligibility' ? 'block' : 'none' }}>
          {eligibilityMounted ? (
            <MarketingAdvertisingEligibilityPage
              ref={eligibilityRef}
              {...eligibilityTabProps}
              onToolbarState={setEligibilityToolbar}
            />
          ) : null}
        </Box>
      </Suspense>
    </Box>
  );
}
