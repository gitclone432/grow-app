import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import AnalyticsPage from './AnalyticsPage.jsx';
import AnalyticsSummaryPage from './AnalyticsSummaryPage.jsx';
import SellerStandardsPage from './SellerStandardsPage.jsx';

const EBAY_ANALYTICS_DOCS =
  'https://developer.ebay.com/api-docs/sell/analytics/static/overview.html';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'metrics', label: 'Service metrics' },
  { id: 'standards', label: 'Seller standards' },
];

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box>{children}</Box>;
}

function tabIndexFromParam(param) {
  const idx = TABS.findIndex((t) => t.id === param);
  return idx >= 0 ? idx : 0;
}

export default function EbayAnalyticsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabValue, setTabValue] = useState(() => tabIndexFromParam(searchParams.get('tab')));

  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [focusEvaluationType, setFocusEvaluationType] = useState(null);
  const [focusMetricType, setFocusMetricType] = useState(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    api.get('/sellers/all')
      .then(({ data }) => {
        const list = data || [];
        setSellers(list);
        if (list.length > 0) setSellerId((prev) => prev || list[0]._id);
      })
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    const param = searchParams.get('tab');
    if (param) setTabValue(tabIndexFromParam(param));
  }, [searchParams]);

  const selectedSellerName = useMemo(
    () => sellers.find((s) => String(s._id) === String(sellerId))?.user?.username || '',
    [sellers, sellerId]
  );

  const handleTabChange = (_event, newValue) => {
    setTabValue(newValue);
    setSearchParams({ tab: TABS[newValue].id }, { replace: true });
  };

  const handleOpenSeller = useCallback((nextSellerId, tabId = 'standards', opts = {}) => {
    if (nextSellerId) setSellerId(nextSellerId);
    if (opts.evaluationType) setFocusEvaluationType(opts.evaluationType);
    if (opts.metricType) setFocusMetricType(opts.metricType);
    setFocusKey((k) => k + 1);
    const idx = tabIndexFromParam(tabId);
    setTabValue(idx);
    setSearchParams({ tab: TABS[idx].id }, { replace: true });
  }, [setSearchParams]);

  const activeTabId = TABS[tabValue]?.id;
  const showSellerFilter = activeTabId === 'metrics' || activeTabId === 'standards';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1800, mx: 'auto' }}>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Analytics</Typography>
        <Typography variant="body2" color="text.secondary">
          Overview of standards and service metrics across sellers
          {showSellerFilter && selectedSellerName ? ` · ${selectedSellerName}` : ''}
          {' — '}
          <Link href={EBAY_ANALYTICS_DOCS} target="_blank" rel="noopener noreferrer">API docs</Link>
        </Typography>
      </Stack>

      {showSellerFilter ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <FormControl fullWidth size="small" sx={{ maxWidth: 360 }}>
            <InputLabel>Seller</InputLabel>
            <Select label="Seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              {sellers.map((s) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.user?.username || s.user?.email || s._id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>
      ) : null}

      <Paper variant="outlined" sx={{ mb: 0 }}>
        <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          {TABS.map((tab) => (
            <Tab key={tab.id} label={tab.label} />
          ))}
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <AnalyticsSummaryPage
          embedded
          active={activeTabId === 'summary'}
          onOpenSeller={handleOpenSeller}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <AnalyticsPage
          embedded
          sellers={sellers}
          sellerId={sellerId}
          hideSellerFilter
          active={activeTabId === 'metrics'}
          focusEvaluationType={focusEvaluationType}
          focusMetricType={focusMetricType}
          focusKey={focusKey}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <SellerStandardsPage
          embedded
          sellers={sellers}
          sellerId={sellerId}
          hideSellerFilter
          active={activeTabId === 'standards'}
          focusCycle={focusEvaluationType}
          focusKey={focusKey}
        />
      </TabPanel>
    </Box>
  );
}
