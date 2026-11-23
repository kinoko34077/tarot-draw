/**
 * fetch with bounded retries for transient failures (HTTP 429/5xx and network errors).
 * Used by build scripts that download from public services which rate-limit shared CI runners.
 * The last response is returned unchanged so callers keep their own status handling.
 */
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function retryDelayMs(response, attempt, { baseDelayMs, maxDelayMs, now = Date.now }) {
  const header = response?.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(date - now(), 0), maxDelayMs);
  }
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

export async function fetchWithRetry(url, options = {}, settings = {}) {
  const {
    attempts = 4,
    baseDelayMs = 2000,
    maxDelayMs = 60000,
    fetchImpl = globalThis.fetch,
    sleep = sleepMs,
    now = Date.now,
    onRetry = () => {}
  } = settings;
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      onRetry({ attempt, delay, reason: String(error?.message ?? error) });
      await sleep(delay);
      continue;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt >= attempts) return response;
    const delay = retryDelayMs(response, attempt, { baseDelayMs, maxDelayMs, now });
    onRetry({ attempt, delay, reason: 'HTTP ' + response.status });
    await sleep(delay);
  }
}
