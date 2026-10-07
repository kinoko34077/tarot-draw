import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, normalizeApiBaseUrl, resolveRuntimeConfig } from '../web/runtime-config.js';

test('same-origin runtime stays available for local Node server', () => {
  const config = resolveRuntimeConfig({});
  assert.equal(config.apiMode, 'same-origin');
  assert.equal(config.apiAvailable, true);
  assert.equal(buildApiUrl('/api/health', config), '/api/health');
});

test('external runtime is unavailable until API base URL exists', () => {
  const config = resolveRuntimeConfig({ apiMode: 'external', apiBaseUrl: '   ' });
  assert.equal(config.apiAvailable, false);
  assert.throws(() => buildApiUrl('/api/sessions', config), /not configured/);
});

test('external API base is normalized and preserves an optional path prefix', () => {
  assert.equal(normalizeApiBaseUrl(' https://api.example.test/tarot/// '), 'https://api.example.test/tarot');
  const config = resolveRuntimeConfig({ apiMode: 'external', apiBaseUrl: 'https://api.example.test/tarot/' });
  assert.equal(config.apiAvailable, true);
  assert.equal(buildApiUrl('/api/sessions', config), 'https://api.example.test/tarot/api/sessions');
});
