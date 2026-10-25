import { expect, test } from 'bun:test';
import { ANTHROPIC_MESSAGES_URL, slotUsage } from './anthropic-handlers.ts';

test('it answers a token it holds usage for with a message and that usage in the rate-limit headers', async () => {
  slotUsage.set('Bearer sk-ant-kettle-mock-0001', { five: { utilization: 0.25, reset: 1_792_000_000 }, seven: { utilization: 0.5, reset: 1_792_400_000 } });

  const response = await fetch(ANTHROPIC_MESSAGES_URL, { method: 'POST', headers: { authorization: 'Bearer sk-ant-kettle-mock-0001' }, body: '{}' });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);
  expect(Object.fromEntries([...response.headers].filter(([name]) => name.startsWith('anthropic-ratelimit-')))).toStrictEqual({
    'anthropic-ratelimit-unified-5h-utilization': '0.25',
    'anthropic-ratelimit-unified-5h-reset': '1792000000',
    'anthropic-ratelimit-unified-7d-utilization': '0.5',
    'anthropic-ratelimit-unified-7d-reset': '1792400000',
  });
  expect(body).toMatchObject({ type: 'message', role: 'assistant' });
});

test('it leaves out the headers of a window the record has no usage for', async () => {
  slotUsage.set('Bearer sk-ant-kettle-mock-0002', { seven: { utilization: 0.4, reset: 1_792_540_800 } });

  const response = await fetch(ANTHROPIC_MESSAGES_URL, { method: 'POST', headers: { authorization: 'Bearer sk-ant-kettle-mock-0002' }, body: '{}' });

  expect(Object.fromEntries([...response.headers].filter(([name]) => name.startsWith('anthropic-ratelimit-')))).toStrictEqual({
    'anthropic-ratelimit-unified-7d-utilization': '0.4',
    'anthropic-ratelimit-unified-7d-reset': '1792540800',
  });
});

test.each([
  ['no authorization header', {}],
  ['a token it holds no usage for', { authorization: 'Bearer sk-ant-kettle-mock-other' }],
  ['an empty bearer', { authorization: 'Bearer ' }],
  ['the held token under a different scheme', { authorization: 'Basic sk-ant-kettle-mock-0001' }],
])('it refuses %s with a 401 and no rate-limit headers', async (_label, headers: Record<string, string>) => {
  slotUsage.set('Bearer sk-ant-kettle-mock-0001', { seven: { utilization: 0.4, reset: 1_792_540_800 } });

  const response = await fetch(ANTHROPIC_MESSAGES_URL, { method: 'POST', headers, body: '{}' });
  const body: unknown = await response.json();

  expect(response.status).toBe(401);
  expect([...response.headers.keys()].filter((name) => name.startsWith('anthropic-ratelimit-'))).toStrictEqual([]);
  expect(body).toStrictEqual({ type: 'error', error: { type: 'authentication_error', message: 'Invalid bearer token' } });
});
