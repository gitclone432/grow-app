// Resolves the real client IP behind the proxies in front of the API. The AI
// usage log attributes spend by IP, so every route that calls OpenAI on a
// user's behalf must resolve the address the same way or its calls land in a
// separate "Unknown IP" row on the admin usage report.

export function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function getClientIpInfo(req) {
  const candidates = [
    ['cf-connecting-ip', firstHeaderValue(req.headers['cf-connecting-ip']).trim()],
    ['true-client-ip', firstHeaderValue(req.headers['true-client-ip']).trim()],
    ['x-real-ip', firstHeaderValue(req.headers['x-real-ip']).trim()]
  ];
  for (const [ipSource, ipAddress] of candidates) {
    if (ipAddress) return { ipAddress, ipSource };
  }

  const forwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
  const firstForwardedIp = forwardedFor.split(',').map((ip) => ip.trim()).find(Boolean);
  if (firstForwardedIp) return { ipAddress: firstForwardedIp, ipSource: 'x-forwarded-for' };

  return { ipAddress: req.ip, ipSource: 'req.ip' };
}

// The request-derived half of an AI usage context (IP, forwarded chain, UA,
// acting user). Callers add templateId / sellerId / aiRunId for their run.
export function buildRequestUsageContext(req) {
  const ipInfo = getClientIpInfo(req);
  return {
    userId: req.user?.userId,
    ipAddress: ipInfo.ipAddress,
    ipSource: ipInfo.ipSource,
    forwardedFor: req.headers['x-forwarded-for'] || '',
    userAgent: req.get('user-agent') || ''
  };
}
