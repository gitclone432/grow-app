import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { formatDateOnly, formatEndingSoonBanner } from '../../lib/marketingUtils.js';
import { useMarketingEndingSoon } from '../../hooks/useMarketingEndingSoon.js';

function daysLeftLabel(daysLeft) {
  if (daysLeft == null) return 'Ending soon';
  if (daysLeft === 0) return 'Ends today';
  if (daysLeft === 1) return 'Ends tomorrow';
  return `Ends in ${daysLeft} days`;
}

export default function MarketingEndingSoonAlert({ sellerId, marketplace }) {
  const [open, setOpen] = useState(false);
  const { items, loading, count, refresh } = useMarketingEndingSoon({ sellerId, marketplace });

  if (!loading && count === 0) return null;

  return (
    <>
      <Alert
        severity="warning"
        icon={<EventBusyIcon fontSize="inherit" />}
        onClick={() => {
          refresh();
          setOpen(true);
        }}
        sx={{
          cursor: 'pointer',
          py: 0.5,
          alignItems: 'center',
          maxWidth: 320,
          '& .MuiAlert-message': { width: '100%' },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {loading ? 'Checking endings…' : formatEndingSoonBanner(items)}
          </Typography>
          {!loading && count > 0 ? (
            <Chip size="small" color="warning" label="View" sx={{ fontWeight: 700 }} />
          ) : null}
        </Stack>
      </Alert>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          Ending within 5 days
          <IconButton
            aria-label="close"
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Running coupons, markdown sales, and CPS campaigns ending soon.
          </Typography>

          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No coupons, markdowns, or CPS campaigns ending in the next 5 days.
            </Typography>
          ) : (
            <List dense disablePadding>
              {items.map((item) => (
                <ListItem
                  key={item.id}
                  alignItems="flex-start"
                  sx={{
                    px: 0,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <ListItemText
                    primary={(
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.name}
                        </Typography>
                        <Chip size="small" label={item.typeLabel} color="warning" variant="outlined" />
                      </Stack>
                    )}
                    secondary={(
                      <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {daysLeftLabel(item.daysLeft)} · Ends {formatDateOnly(item.endDate)}
                        </Typography>
                        {item.sellerName ? (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Store: {item.sellerName}
                          </Typography>
                        ) : null}
                        {item.couponCode ? (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Coupon: {item.couponCode}
                          </Typography>
                        ) : null}
                        {item.marketplaceId ? (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {item.marketplaceId}
                          </Typography>
                        ) : null}
                      </Box>
                    )}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
