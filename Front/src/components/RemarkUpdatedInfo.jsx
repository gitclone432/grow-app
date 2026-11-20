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

/** Extract Reason (Issue) audit fields from a `/manual-fields` response order (empty object if absent). */
export function issueReasonAuditFrom(order) {
  if (!order || !Object.prototype.hasOwnProperty.call(order, 'issueReasonUpdatedAt')) return {};
  return {
    issueReasonUpdatedBy: order.issueReasonUpdatedBy ?? null,
    issueReasonUpdatedAt: order.issueReasonUpdatedAt ?? null,
  };
}

/**
 * Small caption under a Remark (or Reason) cell: "by <username> · 19 Nov 2026, 03:45 pm IST".
 * Renders nothing when the field has never been stamped. `label` is used in the hover text.
 */
export default function RemarkUpdatedInfo({ by, at, sx, label = 'Remark' }) {
  const when = formatRemarkUpdatedAtIST(at);
  if (!by && !when) return null;
  const text = [by ? `by ${by}` : null, when || null].filter(Boolean).join(' · ');
  return (
    <Typography
      component="div"
      variant="caption"
      color="text.secondary"
      title={`${label} last updated ${text}`}
      sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.25, mt: 0.25, whiteSpace: 'normal', ...sx }}
    >
      {text}
    </Typography>
  );
}
