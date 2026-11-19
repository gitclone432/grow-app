import { Typography } from '@mui/material';

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatRemarkUpdatedAtIST(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${IST_FORMATTER.format(date)} IST`;
}

/** Extract remark audit fields from a `/manual-fields` response order (empty object if absent). */
export function remarkAuditFrom(order) {
  if (!order || !Object.prototype.hasOwnProperty.call(order, 'remarkUpdatedAt')) return {};
  return {
    remarkUpdatedBy: order.remarkUpdatedBy ?? null,
    remarkUpdatedAt: order.remarkUpdatedAt ?? null,
  };
}

/**
 * Small caption under a Remark cell: "by <username> · 19 Nov 2026, 03:45 pm IST".
 * Renders nothing when the remark has never been stamped.
 */
export default function RemarkUpdatedInfo({ by, at, sx }) {
  const when = formatRemarkUpdatedAtIST(at);
  if (!by && !when) return null;
  const text = [by ? `by ${by}` : null, when || null].filter(Boolean).join(' · ');
  return (
    <Typography
      component="div"
      variant="caption"
      color="text.secondary"
      title={`Remark last updated ${text}`}
      sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.25, mt: 0.25, whiteSpace: 'normal', ...sx }}
    >
      {text}
    </Typography>
  );
}
