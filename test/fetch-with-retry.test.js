import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithRetry, retryDelayMs } from '../scripts/fetch-with-retry.mjs';

const res = (status, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers) });
const scripted = (...steps) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return { fetchImpl, calls };
};

test('returns immediately on success without sleeping', async () => {
  const { fetchImpl, calls } = scripted(res(200));
  const sleeps = [];
  const response = await fetchWithRetry('u', { a: 1 }, { fetchImpl, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { a: 1 });
  assert.deepEqual(sleeps, []);
});

test('retries HTTP 429 honoring Retry-After seconds, capped by maxDelayMs', async () => {
  const { fetchImpl, calls } = scripted(res(429, { 'retry-after': '7' }), res(429, { 'retry-after': '500' }), res(200));
  const sleeps = [];
  const response = await fetchWithRetry('u', {}, { fetchImpl, sleep: async (ms) => sleeps.push(ms), maxDelayMs: 30000 });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [7000, 30000]);
});

test('uses exponential backoff without Retry-After and retries 5xx', async () => {
  const { fetchImpl } = scripted(res(503), res(502), res(200));
  const sleeps = [];
  const response = await fetchWithRetry('u', {}, { fetchImpl, sleep: async (ms) => sleeps.push(ms), baseDelayMs: 1000 });
  assert.equal(response.status, 200);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('does not retry non-transient client errors', async () => {
  const { fetchImpl, calls } = scripted(res(404), res(200));
  const response = await fetchWithRetry('u', {}, { fetchImpl, sleep: async () => {} });
  assert.equal(response.status, 404);
  assert.equal(calls.length, 1);
});

test('returns the last response after the attempts are exhausted so callers keep their status handling', async () => {
  const { fetchImpl, calls } = scripted(res(429));
  const sleeps = [];
  const response = await fetchWithRetry('u', {}, { fetchImpl, sleep: async (ms) => sleeps.push(ms), attempts: 3, baseDelayMs: 10 });
  assert.equal(response.status, 429);
  assert.equal(calls.length, 3);
  assert.equal(sleeps.length, 2);
});

test('retries network errors and rethrows the last one when exhausted', async () => {
  const ok = scripted(new TypeError('fetch failed'), res(200));
  assert.equal((await fetchWithRetry('u', {}, { fetchImpl: ok.fetchImpl, sleep: async () => {} })).status, 200);
  const bad = scripted(new TypeError('fetch failed'));
  await assert.rejects(fetchWithRetry('u', {}, { fetchImpl: bad.fetchImpl, sleep: async () => {}, attempts: 2 }), /fetch failed/);
  assert.equal(bad.calls.length, 2);
});

test('Retry-After accepts an HTTP date and is never negative', () => {
  const now = () => Date.parse('2026-11-23T00:00:00Z');
  const settings = { baseDelayMs: 1000, maxDelayMs: 60000, now };
  assert.equal(retryDelayMs(res(429, { 'retry-after': 'Mon, 23 Nov 2026 00:00:10 GMT' }), 1, settings), 10000);
  assert.equal(retryDelayMs(res(429, { 'retry-after': 'Mon, 22 Nov 2026 00:00:00 GMT' }), 1, settings), 0);
});
