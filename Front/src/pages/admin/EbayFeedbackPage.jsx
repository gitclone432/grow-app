import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
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
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { FEEDBACK_DOCS } from '../../utils/ebayFeedback';
import AwaitingFeedbackPanel from '../../components/ebayFeedback/AwaitingFeedbackPanel.jsx';
import FeedbackListPanel from '../../components/ebayFeedback/FeedbackListPanel.jsx';
import FeedbackRatingSummaryPanel from '../../components/ebayFeedback/FeedbackRatingSummaryPanel.jsx';

const TABS = [
  { id: 'summary', label: 'Rating summary' },
  { id: 'history', label: 'Feedback history' },
  { id: 'awaiting', label: 'Awaiting feedback' },
];

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

function tabIndexFromParam(param) {
  const idx = TABS.findIndex((t) => t.id === param);
  return idx >= 0 ? idx : 0;
}

export default function EbayFeedbackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabValue, setTabValue] = useState(() => tabIndexFromParam(searchParams.get('tab')));

  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

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

  const activeTabId = TABS[tabValue]?.id;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Feedback</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Rating summary, feedback history, and pending feedback —{' '}
            <Link href={FEEDBACK_DOCS.summary} target="_blank" rel="noopener noreferrer">API docs</Link>
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={!sellerId}
          sx={{ alignSelf: { md: 'flex-start' }, flexShrink: 0 }}
        >
          Refresh active tab
        </Button>
      </Stack>

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

      <Paper variant="outlined" sx={{ mb: 0 }}>
        <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          {TABS.map((tab) => (
            <Tab key={tab.id} label={tab.label} />
          ))}
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <FeedbackRatingSummaryPanel
          key={`summary-${sellerId}-${refreshKey}`}
          sellerId={sellerId}
          selectedSellerName={selectedSellerName}
          active={activeTabId === 'summary'}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <FeedbackListPanel
          key={`history-${sellerId}-${refreshKey}`}
          sellerId={sellerId}
          selectedSellerName={selectedSellerName}
          active={activeTabId === 'history'}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <AwaitingFeedbackPanel
          key={`awaiting-${sellerId}-${refreshKey}`}
          sellerId={sellerId}
          selectedSellerName={selectedSellerName}
          active={activeTabId === 'awaiting'}
        />
      </TabPanel>
    </Box>
  );
}
