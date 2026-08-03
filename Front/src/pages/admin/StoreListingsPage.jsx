import { Suspense, useState } from 'react';
import { Box, CircularProgress, Tab, Tabs } from '@mui/material';
import { lazyWithRetry as lazy } from '../../lib/lazyImport.js';

const StoreListingsInventoryPage = lazy(() => import('./StoreListingsInventoryPage.jsx'));

const TAB_TO_VIEW = ['listings', 'ended', 'sync'];

export default function StoreListingsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ pb: 3 }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mb: 2,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 44 },
          }}
        >
          <Tab label="Active Listings" />
          <Tab label="Ended Listings" />
          <Tab label="Sync status" />
        </Tabs>
      </Box>

      <Suspense
        fallback={(
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      >
        <StoreListingsInventoryPage
          key={TAB_TO_VIEW[tab] || 'listings'}
          embedded
          active
          viewMode={TAB_TO_VIEW[tab] || 'listings'}
        />
      </Suspense>
    </Box>
  );
}
