import crypto from 'crypto';

function md5(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

function parseDigestChallenge(header) {
  const out = {};
  String(header || '').replace(/([a-zA-Z0-9_-]+)=("([^"]*)"|([^,\s]+))/g, (_m, key, _g2, quoted, bare) => {
    out[key] = quoted ?? bare;
    return '';
  });
  return out;
}

/**
 * Atlas Admin API GET using HTTP Digest (API public/private keys).
 * Path should start with /groups/... (no host).
 */
export async function atlasDigestGet(pathWithQuery) {
  const publicKey = String(process.env.ATLAS_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.ATLAS_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    throw new Error('ATLAS_PUBLIC_KEY and ATLAS_PRIVATE_KEY are not set');
  }

  const url = `https://cloud.mongodb.com/api/atlas/v2${pathWithQuery}`;
  const accept = { Accept: 'application/vnd.atlas.2023-02-01+json' };
  const first = await fetch(url, { headers: accept });
  if (first.status !== 401) {
    if (!first.ok) {
      throw new Error(`Atlas ${first.status}: ${await first.text()}`);
    }
    return first.json();
  }

  const challenge = parseDigestChallenge(first.headers.get('www-authenticate'));
  const uri = new URL(url).pathname + new URL(url).search;
  const ha1 = md5(`${publicKey}:${challenge.realm}:${privateKey}`);
  const ha2 = md5(`GET:${uri}`);
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const qop = challenge.qop || 'auth';
  const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  const authorization = [
    `Digest username="${publicKey}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${response}"`,
    'algorithm=MD5',
  ].join(', ');

  const second = await fetch(url, {
    headers: { ...accept, Authorization: authorization },
  });
  if (!second.ok) {
    throw new Error(`Atlas ${second.status}: ${await second.text()}`);
  }
  return second.json();
}
