import { useState } from 'react';
import {
  Box,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import MarketingCampaignsPage from './MarketingCampaignsPage.jsx';
import MarketingPromotionsPage from './MarketingPromotionsPage.jsx';

export default function AdsAndMarketingPage() {
  const [tab, setTab] = useState('promotions');

  return (
    <Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
          Ads and Marketing
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Everything for campaigns and promotions in one page.
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab value="promotions" label="Marketing Promotions" />
          <Tab value="campaigns" label="Marketing Campaigns" />
        </Tabs>
      </Box>

      {tab === 'promotions' ? <MarketingPromotionsPage /> : null}
      {tab === 'campaigns' ? <MarketingCampaignsPage /> : null}
    </Box>
  );
}
