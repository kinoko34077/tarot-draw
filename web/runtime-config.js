export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

export function resolveRuntimeConfig(raw = {}) {
  const apiMode = raw.apiMode === 'external' ? 'external' : 'same-origin';
  const apiBaseUrl = normalizeApiBaseUrl(raw.apiBaseUrl);
  return Object.freeze({
    apiMode,
    apiBaseUrl,
    apiAvailable: apiMode === 'same-origin' || Boolean(apiBaseUrl)
  });
}

export function buildApiUrl(path, runtimeConfig) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('API path must start with /.');
  }
  if (runtimeConfig.apiMode === 'same-origin') return path;
  if (!runtimeConfig.apiAvailable || !runtimeConfig.apiBaseUrl) {
    throw new Error('Tarot API is not configured.');
  }
  return new URL(path.slice(1), runtimeConfig.apiBaseUrl + '/').toString();
}
