import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Badge,
  IconButton,
  Popover,
  Stack,
  Button,
  CircularProgress,
  Tooltip,
  Divider,
  Alert,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import StatusChip from './StatusChip';
import { BRAND_DARK, BRAND_YELLOW } from '../constants/brandTheme';

const TYPE_LABELS = {
  CODED_COUPON: 'Coupon',
  MARKDOWN_SALE: 'Sale event',
};

// Pacific Time, matching the Discounts page / eBay Seller Hub
const formatDatePT = (d) =>
  d
    ? new Date(d).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
    : '—';

const timeLeft = (endDate) => {
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
};

/**
 * Header bell showing active coupons / sale events that end within 3 days,
 * across all sellers visible to the user.
 *
 * Reads a server-side cache that a cron job refreshes from eBay every
 * 12 hours — mounting this component, navigating, or reloading pages never
 * hits the eBay API. Only the "Refresh now" button in the popover forces
 * an immediate eBay re-fetch.
 */
export default function DiscountAlertsBell() {
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchAlerts = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setFetchError('');
    try {
      const { data } = await api.get('/ebay/discounts/ending-soon', {
        params: { days: 3, ...(forceRefresh ? { refresh: 'true' } : {}) },
      });
      setAlerts(data.alerts || []);
      setErrors(data.errors || []);
      setFetchedAt(data.fetchedAt || null);
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      setFetchError(`Failed to check discounts: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // One read of the server cache on mount — cheap, never calls eBay
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const open = Boolean(anchorEl);
  const hasProblems = errors.length > 0 || Boolean(fetchError);

  return (
    <>
      <Tooltip title="Discounts ending within 3 days" arrow>
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            mr: 1,
            minHeight: 40,
            minWidth: 40,
            borderRadius: 2.5,
            color: BRAND_YELLOW,
            border: '1px solid rgba(245, 200, 66, 0.22)',
            backgroundColor: 'rgba(245, 200, 66, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(245, 200, 66, 0.16)',
              borderColor: 'rgba(245, 200, 66, 0.34)',
            },
          }}
        >
          <Badge
            badgeContent={alerts.length}
            color="error"
            max={99}
            invisible={alerts.length === 0 && !hasProblems}
            variant={alerts.length === 0 && hasProblems ? 'dot' : 'standard'}
            overlap="circular"
            sx={{
              '& .MuiBadge-badge': {
                fontWeight: 700,
                boxShadow: '0 0 0 2px rgba(15, 15, 23, 0.9)',
              },
            }}
          >
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: '95vw', borderRadius: 2 } } }}
      >
        {/* ── Header ── */}
        <Box sx={{ px: 2, py: 1.5, bgcolor: BRAND_DARK, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalOfferOutlinedIcon sx={{ fontSize: 18, color: BRAND_YELLOW }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Discounts Ending Soon
            </Typography>
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.6) }}>
              Active coupons & sale events ending within 3 days
              {fetchedAt ? ` · last checked ${new Date(fetchedAt).toLocaleString()}` : ''}
            </Typography>
          </Box>
          <Tooltip title="Refresh now" arrow>
            <IconButton size="small" onClick={() => fetchAlerts(true)} disabled={loading} sx={{ color: BRAND_YELLOW }}>
              {loading ? <CircularProgress size={16} sx={{ color: BRAND_YELLOW }} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* ── Body ── */}
        <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
          {fetchError && (
            <Alert severity="error" sx={{ m: 1.5 }}>{fetchError}</Alert>
          )}

          {errors.length > 0 && (
            <Alert severity="warning" sx={{ m: 1.5 }}>
              <Typography variant="caption" component="div" sx={{ fontWeight: 700, mb: 0.5 }}>
                Could not check {errors.length} seller{errors.length > 1 ? 's' : ''}:
              </Typography>
              {errors.map((e) => (
                <Typography key={e.sellerId} variant="caption" component="div">
                  <b>{e.sellerName}:</b> {e.error}
                </Typography>
              ))}
            </Alert>
          )}

          {loading && alerts.length === 0 && !fetchError ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : alerts.length === 0 && !fetchError ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: 'center' }}>
              No coupons or sale events ending within 3 days. 🎉
            </Typography>
          ) : (
            alerts.map((a, idx) => (
              <React.Fragment key={`${a.sellerId}-${a.promotionId}`}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: (t) => alpha(t.palette.mode === 'dark' ? '#fff' : BRAND_DARK, 0.04) },
                  }}
                  onClick={() => { setAnchorEl(null); navigate('/admin/discounts'); }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </Typography>
                    <StatusChip label={timeLeft(a.endDate)} tone="danger" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div">
                    <b>{a.sellerName}</b> · {TYPE_LABELS[a.promotionType] || a.promotionType}
                    {a.couponCode ? ` · ${a.couponCode}` : ''}
                  </Typography>
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                    Ends {formatDatePT(a.endDate)}
                  </Typography>
                </Box>
              </React.Fragment>
            ))
          )}
        </Box>

        {/* ── Footer ── */}
        <Divider />
        <Box sx={{ px: 1.5, py: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={() => { setAnchorEl(null); navigate('/admin/discounts'); }}
            sx={{ fontWeight: 700, color: BRAND_DARK }}
          >
            View All Discounts
          </Button>
        </Box>
      </Popover>
    </>
  );
}
