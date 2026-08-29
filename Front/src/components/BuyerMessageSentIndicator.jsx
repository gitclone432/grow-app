import React from 'react';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export function parseBuyerMessageSentAt(value) {
  if (!value) return null;
  const sentAt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(sentAt.getTime()) ? null : sentAt;
}

export function hasSentBuyerMessage(item) {
  return Boolean(parseBuyerMessageSentAt(item?.lastSellerMessageAt));
}

export default function BuyerMessageSentIndicator({
  item,
  title = 'Buyer message sent',
  size = 16,
  sx,
}) {
  const sentAt = parseBuyerMessageSentAt(item?.lastSellerMessageAt);

  if (!sentAt) return null;

  return (
    <Tooltip title={`${title} at ${sentAt.toLocaleString()}`}>
      <CheckCircleIcon sx={{ fontSize: size, color: 'success.main', ...sx }} />
    </Tooltip>
  );
}