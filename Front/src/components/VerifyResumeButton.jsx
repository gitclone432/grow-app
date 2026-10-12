import { Button, Stack, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DoneAllIcon from '@mui/icons-material/DoneAll';

const formatEndedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * "Resume after #N" for a verify list — opens the verify panel on the row
 * after the furthest one with an ended listing — and, beside it, how many
 * rows still have a live listing with a jump to the first of them (see
 * useVerifyResumePoint).
 */
export default function VerifyResumeButton({ resumePoint, live, total = 0, onResume, onOpenFirstLive, disabled = false }) {
  if (!resumePoint) return null;
  const position = resumePoint.position.toLocaleString();
  const endedLine = [
    resumePoint.endedBy ? `by ${resumePoint.endedBy}` : '',
    resumePoint.endedAt ? `on ${formatEndedAt(resumePoint.endedAt)}` : ''
  ].filter(Boolean).join(' ');
  const detail = `Furthest row with a listing ended from this page: #${position}${resumePoint.sku ? ` (${resumePoint.sku})` : ''}${endedLine ? `, ended ${endedLine}` : ''}.`;
  const atEnd = total > 0 && resumePoint.position >= total;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {atEnd ? (
        <Tooltip title={`${detail} That is the last row of this list.`}>
          <span>
            <Button size="small" variant="outlined" color="success" startIcon={<DoneAllIcon />} disabled sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
              Ended through the last row (#{position})
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Tooltip title={`${detail} Opens the next row.`}>
          <span>
            <Button size="small" variant="contained" disableElevation startIcon={<PlayArrowIcon />} onClick={onResume} disabled={disabled} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
              Resume after #{position}
            </Button>
          </span>
        </Tooltip>
      )}
      {live && live.count === 0 && (
        <Tooltip title="Every row in this list has had its listings ended.">
          <span>
            <Button size="small" variant="text" color="success" disabled sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
              No live rows left
            </Button>
          </span>
        </Tooltip>
      )}
      {live && live.count > 0 && live.first && (
        <Tooltip title={`${live.count.toLocaleString()} row(s) in this list still have a listing that hasn't been ended — reviewed and kept, or skipped. Opens the first one.`}>
          <span>
            <Button size="small" variant="outlined" color="warning" onClick={onOpenFirstLive} disabled={disabled} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
              {live.count.toLocaleString()} still live · open #{live.first.position.toLocaleString()}
            </Button>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
