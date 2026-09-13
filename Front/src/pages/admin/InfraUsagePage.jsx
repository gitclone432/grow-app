import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../lib/api';
import SectionCard from '../../components/SectionCard.jsx';

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 10 || i === 0 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function usageColor(percent) {
  if (percent >= 90) return 'error';
  if (percent >= 70) return 'warning';
  return 'success';
}

function UsageBar({ label, used, total, hint }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;
  return (
    <Box sx={{ minWidth: 220, flex: 1 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {pct == null ? formatBytes(used) : `${formatBytes(used)} / ${formatBytes(total)} (${pct}%)`}
        </Typography>
      </Stack>
      {pct != null && (
        <LinearProgress
          variant="determinate"
          value={pct}
          color={usageColor(pct)}
          sx={{ height: 8, borderRadius: 4 }}
        />
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary">{hint}</Typography>
      )}
    </Box>
  );
}

export default function InfraUsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: payload } = await api.get('/infra/usage');
      setData(payload);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load infra usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const mongo = data?.mongo || {};
  const atlas = data?.atlas || {};
  const render = data?.render || {};
  const cacheUsed = atlas.cacheUsedBytes ?? mongo.ram?.cacheUsedBytes;
  const cacheMax = atlas.cacheMaxBytes ?? mongo.ram?.cacheMaxBytes;
  const diskTotal = atlas.diskUsedPercent != null && atlas.diskUsedBytes
    ? atlas.diskUsedBytes / (atlas.diskUsedPercent / 100)
    : mongo.fsTotalBytes;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6">Infra Usage</Typography>
          <Typography variant="body2" color="text.secondary">
            MongoDB storage/RAM pressure and Render outbound bandwidth
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={load}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {loading && !data && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {(data?.notes || []).map((note) => (
        <Alert key={note} severity="warning" sx={{ mb: 1 }}>{note}</Alert>
      ))}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <SectionCard sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>MongoDB storage</Typography>
          <Stack spacing={1.5}>
            <UsageBar
              label="Uncompressed data"
              used={mongo.dataBytes || 0}
              hint="What dashboards scan if queries do not project fields"
            />
            <UsageBar label="On-disk storage" used={mongo.storageBytes || 0} total={diskTotal} />
            <UsageBar label="Indexes" used={mongo.indexBytes || 0} />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`DB: ${mongo.dbName || '—'}`} />
              <Chip size="small" label={`Collections: ${formatCount(mongo.collectionCount || mongo.collections)}`} />
              <Chip size="small" label={`Documents: ${formatCount(mongo.objects)}`} />
            </Stack>
          </Stack>
        </SectionCard>

        <SectionCard sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>MongoDB RAM</Typography>
          {cacheMax || cacheUsed ? (
            <UsageBar
              label="WiredTiger cache"
              used={cacheUsed || 0}
              total={cacheMax || 0}
              hint="If data is larger than this cache, list pages get slow after a storage upgrade"
            />
          ) : (
            <Alert severity="info" sx={{ mb: 1 }}>
              {atlas.hint || mongo.ramError || 'RAM metrics need clusterMonitor on the DB user, or Atlas API keys.'}
            </Alert>
          )}
          {atlas.error && <Alert severity="warning" sx={{ mt: 1 }}>{atlas.error}</Alert>}
          {atlas.cpuPercent != null && (
            <Typography variant="body2" sx={{ mt: 1 }}>CPU: {Number(atlas.cpuPercent).toFixed(1)}%</Typography>
          )}
          {(atlas.connections != null || mongo.ram?.connections != null) && (
            <Typography variant="body2">
              Connections: {formatCount(atlas.connections ?? mongo.ram?.connections)}
            </Typography>
          )}
        </SectionCard>

        <SectionCard sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Render bandwidth</Typography>
          {render.configured === false ? (
            <Alert severity="info">{render.hint}</Alert>
          ) : render.error ? (
            <Alert severity="warning">{render.error}</Alert>
          ) : (
            <Stack spacing={1}>
              <Chip color="primary" variant="outlined" label={`Last 24h: ${formatBytes(render.last24hBytes)}`} />
              <Chip variant="outlined" label={`Last 30d: ${formatBytes(render.last30dBytes)}`} />
              {(render.services || []).map((svc) => (
                <Typography key={svc.id} variant="caption" color="text.secondary">
                  {svc.id}: {formatBytes(svc.last24hBytes)} / 24h
                </Typography>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Stack>

      <Paper>
        {loading && data && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 700 }}>Collection</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Documents</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Avg doc</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Data</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Storage</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Indexes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(mongo.topCollections || []).map((row) => (
                <TableRow key={row.name} hover>
                  <TableCell>{row.name}</TableCell>
                  <TableCell align="right">{formatCount(row.count)}</TableCell>
                  <TableCell align="right">{formatBytes(row.avgObjBytes)}</TableCell>
                  <TableCell align="right">{formatBytes(row.dataBytes)}</TableCell>
                  <TableCell align="right">{formatBytes(row.storageBytes)}</TableCell>
                  <TableCell align="right">{formatBytes(row.indexBytes)}</TableCell>
                </TableRow>
              ))}
              {(!mongo.topCollections || mongo.topCollections.length === 0) && !loading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary">No collection stats yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {data?.fetchedAt && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Updated {new Date(data.fetchedAt).toLocaleString()}{data.cached ? ' (cached 45s)' : ''}
        </Typography>
      )}
    </Box>
  );
}
