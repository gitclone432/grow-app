import { Router } from 'express';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { atlasDigestGet } from '../utils/atlasDigest.js';

const router = Router();
const cache = new NodeCache({ stdTTL: 45, checkperiod: 30, useClones: false });

function latestPoint(measurement) {
  const points = measurement?.dataPoints || [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i]?.value != null) {
      return { value: points[i].value, at: points[i].timestamp };
    }
  }
  return null;
}

function namedMeasurement(payload, name) {
  const list = payload?.measurements || [];
  return latestPoint(list.find((m) => m.name === name));
}

async function collectMongoStorage() {
  const db = mongoose.connection.db;
  const stats = await db.stats();
  const collectionsMeta = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = collectionsMeta
    .map((c) => c.name)
    .filter((name) => name && !name.startsWith('system.'));

  const priority = [
    'templatelistings',
    'listings',
    'activelistings',
    'orders',
    'messages',
    'asinprechecks',
    'asindirectories',
    'feeduploads',
    'ebaymessageconversations',
  ];
  const remaining = names.filter((name) => !priority.includes(name)).slice(0, 16);
  const namesToStat = [...priority.filter((name) => names.includes(name)), ...remaining];

  const collections = [];
  const chunkSize = 8;
  for (let i = 0; i < namesToStat.length; i += chunkSize) {
    const chunk = namesToStat.slice(i, i + chunkSize);
    const rows = await Promise.all(chunk.map(async (name) => {
      try {
        const s = await db.command({ collStats: name });
        return {
          name,
          count: s.count || 0,
          dataBytes: s.size || 0,
          storageBytes: s.storageSize || 0,
          indexBytes: s.totalIndexSize || 0,
          avgObjBytes: s.count ? Math.round((s.size || 0) / s.count) : 0,
          nIndexes: s.nindexes || Object.keys(s.indexSizes || {}).length,
        };
      } catch {
        return null;
      }
    }));
    collections.push(...rows.filter(Boolean));
  }

  collections.sort((a, b) => b.storageBytes - a.storageBytes);

  let ram = null;
  let ramError = null;
  try {
    const ss = await db.command({ serverStatus: 1 });
    const wt = ss?.wiredTiger?.cache || {};
    ram = {
      source: 'serverStatus',
      cacheMaxBytes: wt['maximum bytes configured'] || null,
      cacheUsedBytes: wt['bytes currently in the cache'] || null,
      cacheDirtyBytes: wt['tracked dirty bytes in the cache'] || null,
      connections: ss?.connections?.current || null,
      host: ss?.host || null,
    };
  } catch (err) {
    ramError = err.message;
  }

  return {
    dbName: db.databaseName,
    objects: stats.objects || 0,
    collections: stats.collections || collections.length,
    dataBytes: stats.dataSize || 0,
    storageBytes: stats.storageSize || 0,
    indexBytes: stats.indexSize || 0,
    fsUsedBytes: stats.fsUsedSize || null,
    fsTotalBytes: stats.fsTotalSize || null,
    ram,
    ramError,
    topCollections: collections.slice(0, 30),
    collectionCount: collections.length,
  };
}

async function collectAtlasRam() {
  const groupId = String(process.env.ATLAS_GROUP_ID || process.env.ATLAS_PROJECT_ID || '').trim();
  const clusterName = String(process.env.ATLAS_CLUSTER_NAME || '').trim();
  if (!process.env.ATLAS_PUBLIC_KEY || !process.env.ATLAS_PRIVATE_KEY || !groupId) {
    return {
      configured: false,
      hint: 'Set ATLAS_PUBLIC_KEY, ATLAS_PRIVATE_KEY, and ATLAS_GROUP_ID to read cluster RAM from Atlas.',
    };
  }

  const processesPayload = await atlasDigestGet(`/groups/${encodeURIComponent(groupId)}/processes?envelope=false`);
  const processes = processesPayload?.results || processesPayload || [];
  const list = Array.isArray(processes) ? processes : [];
  const filtered = clusterName
    ? list.filter((p) => String(p.userAlias || p.replicaSetName || '').includes(clusterName) || String(p.id || '').includes(clusterName))
    : list;
  const primary = filtered.find((p) => /PRIMARY/i.test(p.typeName || '')) || filtered[0] || list[0];
  if (!primary?.id) {
    return { configured: true, error: 'No Atlas processes found for this project.' };
  }

  const processId = encodeURIComponent(primary.id);
  const metrics = [
    'CACHE_USED',
    'CACHE_MAX',
    'CONNECTIONS',
    'NORMALIZED_SYSTEM_CPU_USER',
    'SYSTEM_MEMORY_USED',
    'SYSTEM_MEMORY_AVAILABLE',
    'DISK_PARTITION_SPACE_USED',
    'DISK_PARTITION_SPACE_PERCENT_USED',
    'DB_DATA_SIZE_TOTAL',
    'DB_STORAGE_TOTAL',
  ];
  const qs = metrics.map((m) => `m=${m}`).join('&');
  const measurements = await atlasDigestGet(
    `/groups/${encodeURIComponent(groupId)}/processes/${processId}/measurements?granularity=PT5M&period=PT1H&${qs}`
  );

  return {
    configured: true,
    processId: primary.id,
    typeName: primary.typeName || null,
    cacheUsedBytes: namedMeasurement(measurements, 'CACHE_USED')?.value ?? null,
    cacheMaxBytes: namedMeasurement(measurements, 'CACHE_MAX')?.value ?? null,
    systemMemoryUsedBytes: namedMeasurement(measurements, 'SYSTEM_MEMORY_USED')?.value ?? null,
    systemMemoryAvailableBytes: namedMeasurement(measurements, 'SYSTEM_MEMORY_AVAILABLE')?.value ?? null,
    connections: namedMeasurement(measurements, 'CONNECTIONS')?.value ?? null,
    cpuPercent: namedMeasurement(measurements, 'NORMALIZED_SYSTEM_CPU_USER')?.value ?? null,
    diskUsedBytes: namedMeasurement(measurements, 'DISK_PARTITION_SPACE_USED')?.value ?? null,
    diskUsedPercent: namedMeasurement(measurements, 'DISK_PARTITION_SPACE_PERCENT_USED')?.value ?? null,
    sampledAt: namedMeasurement(measurements, 'CACHE_USED')?.at
      || namedMeasurement(measurements, 'SYSTEM_MEMORY_USED')?.at
      || null,
  };
}

function sumSeries(payload) {
  const series = payload?.data || payload || [];
  const list = Array.isArray(series) ? series : [];
  let bytes = 0;
  let unit = null;
  const toBytes = (value, rawUnit) => {
    const n = Number(value) || 0;
    const u = String(rawUnit || '').toLowerCase();
    if (u.includes('gib') || u === 'gb') return n * 1024 * 1024 * 1024;
    if (u.includes('mib') || u === 'mb') return n * 1024 * 1024;
    if (u.includes('kib') || u === 'kb') return n * 1024;
    return n;
  };
  for (const row of list) {
    const source = row?.labels?.trafficSource || row?.labels?.resource || 'total';
    if (row?.labels?.trafficSource && source !== 'total' && list.some((r) => r?.labels?.trafficSource === 'total')) {
      continue;
    }
    unit = row?.unit || unit;
    for (const point of row?.values || []) {
      bytes += toBytes(point?.value, row?.unit || unit);
    }
  }
  return { bytes, unit };
}

async function renderGet(pathWithQuery) {
  const token = String(process.env.RENDER_API_KEY || '').trim();
  const res = await fetch(`https://api.render.com/v1${pathWithQuery}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Render ${res.status}`);
  }
  return json;
}

async function collectRenderBandwidth() {
  const token = String(process.env.RENDER_API_KEY || '').trim();
  if (!token) {
    return {
      configured: false,
      hint: 'Set RENDER_API_KEY (and optional RENDER_SERVICE_ID) to read Render outbound bandwidth.',
    };
  }

  let serviceIds = String(process.env.RENDER_SERVICE_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!serviceIds.length) {
    const listed = await renderGet('/services?limit=50');
    const rows = Array.isArray(listed) ? listed : [];
    serviceIds = rows
      .map((row) => row?.service?.id || row?.id)
      .filter(Boolean)
      .slice(0, 8);
  }

  if (!serviceIds.length) {
    return { configured: true, error: 'No Render services found. Set RENDER_SERVICE_ID=srv-xxxxx' };
  }

  const now = new Date();
  const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();

  const services = [];
  for (const id of serviceIds) {
    const resource = encodeURIComponent(id);
    const [day, month] = await Promise.all([
      renderGet(`/metrics/bandwidth?resource=${resource}&startTime=${encodeURIComponent(start24h)}&endTime=${encodeURIComponent(end)}`),
      renderGet(`/metrics/bandwidth?resource=${resource}&startTime=${encodeURIComponent(start30d)}&endTime=${encodeURIComponent(end)}`),
    ]);
    const daySum = sumSeries(day);
    const monthSum = sumSeries(month);
    services.push({
      id,
      last24hBytes: daySum.bytes,
      last30dBytes: monthSum.bytes,
      unit: daySum.unit || monthSum.unit || 'bytes',
    });
  }

  return {
    configured: true,
    services,
    last24hBytes: services.reduce((sum, s) => sum + (s.last24hBytes || 0), 0),
    last30dBytes: services.reduce((sum, s) => sum + (s.last30dBytes || 0), 0),
  };
}

router.get('/usage', requireAuth, requirePageAccess('InfraUsage'), async (_req, res) => {
  try {
    const cached = cache.get('usage');
    if (cached) return res.json({ ...cached, cached: true });

    const mongo = await collectMongoStorage();
    let atlas = { configured: false };
    let render = { configured: false };
    const notes = [];

    try {
      atlas = await collectAtlasRam();
    } catch (err) {
      atlas = { configured: Boolean(process.env.ATLAS_PUBLIC_KEY), error: err.message };
    }
    try {
      render = await collectRenderBandwidth();
    } catch (err) {
      render = { configured: Boolean(process.env.RENDER_API_KEY), error: err.message };
    }

    if (mongo.ramError) {
      notes.push('This MongoDB user cannot read serverStatus (RAM cache). Grant clusterMonitor, or add Atlas API keys.');
    }
    if (mongo.dataBytes > 2 * 1024 * 1024 * 1024) {
      notes.push('Uncompressed data is over 2 GB. An M10 (2 GB RAM) cluster will cache-miss and dashboards will feel slow after storage upgrades.');
    }

    const payload = {
      fetchedAt: new Date().toISOString(),
      mongo,
      atlas,
      render,
      notes,
      cached: false,
    };
    cache.set('usage', payload);
    res.json(payload);
  } catch (err) {
    console.error('[infra/usage]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
