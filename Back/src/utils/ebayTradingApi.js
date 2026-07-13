import axios from 'axios';

const EBAY_TRADING_URL = 'https://api.ebay.com/ws/api.dll';

/** Transient network / overload errors worth retrying on long sync jobs. */
export function isRetryableEbayNetworkError(err) {
  const status = err?.response?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const code = err?.code;
  return (
    code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'ECONNABORTED'
    || code === 'EPIPE'
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
  );
}

/**
 * POST to eBay Trading API with exponential backoff on transient failures.
 */
export async function postEbayTradingApi(xmlRequest, headers, options = {}) {
  const {
    maxRetries = 5,
    timeoutMs = 120000,
    logLabel = 'eBay Trading API',
  } = options;

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.post(EBAY_TRADING_URL, xmlRequest, {
        headers,
        timeout: timeoutMs,
      });
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableEbayNetworkError(err);
      if (retryable && attempt < maxRetries) {
        const waitTime = Math.min(1000 * 2 ** (attempt - 1), 15000);
        console.warn(
          `[${logLabel}] attempt ${attempt}/${maxRetries} failed `
          + `(${err.response?.status || err.code || err.message}); retry in ${waitTime}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      const detail = err.response?.status || err.code || err.message;
      const wrapped = new Error(
        retryable
          ? `eBay request failed after ${attempt} attempt(s): ${detail}`
          : (err.message || String(detail))
      );
      wrapped.cause = err;
      throw wrapped;
    }
  }
  throw lastErr;
}
