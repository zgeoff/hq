import { expect, test } from 'bun:test';
import { buildMockFetch } from './build-mock-fetch.ts';

test('it answers each request with what the responder returns', async () => {
  const mockFetch = buildMockFetch(async (input) => new Response(`asked ${String(input)}`, { status: 418 }));

  const response = await mockFetch('https://kettle.invalid/brew');

  expect([response.status, await response.text()]).toStrictEqual([418, 'asked https://kettle.invalid/brew']);
});

test('it rejects when the responder throws', async () => {
  const mockFetch = buildMockFetch(async () => {
    throw new Error('the kettle is cold');
  });

  await expect(mockFetch('https://kettle.invalid/brew')).rejects.toThrow('the kettle is cold');
});

test('it keeps the preconnect function of the real fetch', () => {
  const mockFetch = buildMockFetch(async () => new Response('ok'));

  expect(mockFetch.preconnect).toBe(fetch.preconnect);
});
