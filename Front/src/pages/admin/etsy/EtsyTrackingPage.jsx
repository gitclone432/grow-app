import { useCallback, useEffect, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Button,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import EtsyOrderFulfilmentPage from './EtsyOrderFulfilmentPage.jsx';

const TRACKING_VISIBLE_COLUMNS = [
  'dateSold',
  'etsyOrdersReceivedTime',
  'shipBy',
  'sku',
  'address',
  'zipCode',
  'messageUpdate',
  'trackingId',
  'remark',
  'trackingIdUploaded',
  'amazonOrderNumber',
];

const TRACKING_COLUMN_LABELS = {
  etsyOrdersReceivedTime: 'Etsy Order Received',
  trackingIdUploaded: 'Tracking Uploaded',
};

const SHIPPED_MESSAGE = `Hi,
Thank you for reaching out. 🙌

We’re happy to inform you that your order has been shipped 🚚 and will be delivered to you soon. 🎉

If you have any questions or need further assistance, feel free to reach out. 💬

Thank you for your understanding and support. 🙏`;

const DELIVERED_MESSAGE = `Hi there! 👋

We just wanted to check in — we hope your order reached you safely and that you're happy with it! 😊

We're a small team, and every order truly matters to us. If something isn't right, please do let us know before leaving a review — we'll personally make sure it gets sorted out for you. ❤️

If you're loving your purchase, an honest 5-star review ⭐⭐⭐⭐⭐ would genuinely make our day. It helps us grow and keeps us going!

Thank you so much for supporting us — it really does mean a lot. Have a lovely day! 🌟

— The Team`;

function getTodayIstYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getMillisecondsUntilNextIstMidnight() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);
  const second = Number(values.second || 0);
  const elapsedTodayMs = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  const fullDayMs = 24 * 60 * 60 * 1000;

  return Math.max(1000, fullDayMs - elapsedTodayMs + 250);
}

export default function EtsyTrackingPage() {
  const [todayIst, setTodayIst] = useState(() => getTodayIstYmd());
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    let timeoutId;

    const scheduleNextSync = () => {
      timeoutId = window.setTimeout(() => {
        setTodayIst(getTodayIstYmd());
        scheduleNextSync();
      }, getMillisecondsUntilNextIstMidnight());
    };

    scheduleNextSync();

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        setTodayIst(getTodayIstYmd());
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, []);

  const handleCopyMessage = useCallback(async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar({ open: true, message: `${label} copied`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: `Failed to copy ${label.toLowerCase()}`, severity: 'error' });
    }
  }, []);

  const copyMessagePanel = (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.25, sm: 1.5 },
        borderRadius: 2,
        backgroundColor: '#faf7ef',
        borderColor: '#e7d8b0',
      }}
    >
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Copy Message
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon fontSize="small" />}
            onClick={() => handleCopyMessage('Shipped Message', SHIPPED_MESSAGE)}
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
          >
            Shipped Message
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon fontSize="small" />}
            onClick={() => handleCopyMessage('Delivered Message', DELIVERED_MESSAGE)}
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
          >
            Delivered Message
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );

  return (
    <>
      <EtsyOrderFulfilmentPage
        title="Tracking"
        columnSelectorPage="etsy-tracking"
        columnStorageKey="etsyTracking.visibleColumns"
        columnLabelOverrides={TRACKING_COLUMN_LABELS}
        apiBasePath="/etsy/tracking"
        fixedVisibleColumns={TRACKING_VISIBLE_COLUMNS}
        allowColumnSelection={false}
        allowImport={false}
        allowCreate={false}
        allowDelete={false}
        showRegionFilter={false}
        dateFilterField="shipBy"
        dateFilterMode="single"
        singleDateLabel="Ship By"
        initialSingleDate={todayIst}
        noFilteredResultsMessage="No orders match the selected ship-by date."
        headerSupplement={copyMessagePanel}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}