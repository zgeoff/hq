import { expect, test } from 'bun:test';
import { runLoginExchange } from './run-login-exchange.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';

function setupTest(hash: string, answer: Response) {
  const kept = new Map<string, string>();
  const posted: { url: string; body: string }[] = [];
  let cleared = false;
  const page = {
    hash,
    origin: 'http://127.0.0.1:4317',
    storage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) },
    clearHash: () => {
      cleared = true;
    },
    post: (url: string, body: string) => {
      posted.push({ url, body });
      return Promise.resolve(answer);
    },
  };
  return { page, kept, posted, wasCleared: () => cleared };
}

test('a link token swaps for a session kept in the tab, and leaves the address bar', async () => {
  const app = setupTest('#t=kettle-token', Response.json({ session: 'kettle-session' }));

  await expect(runLoginExchange(app.page)).resolves.toBe('signed-in');
  expect(app.posted).toStrictEqual([{ url: 'http://127.0.0.1:4317/auth/exchange', body: '{"token":"kettle-token"}' }]);
  expect(app.kept.get(SESSION_STORAGE_KEY)).toBe('kettle-session');
  expect(app.wasCleared()).toBe(true);
});

test('a used token is refused and stores nothing', async () => {
  const app = setupTest('#t=kettle-token', new Response('used', { status: 403 }));

  await expect(runLoginExchange(app.page)).resolves.toBe('refused');
  expect(app.kept.size).toBe(0);
  expect(app.wasCleared()).toBe(true);
});

test('with no token, a tab that holds a session stays signed in and one that holds none is not', async () => {
  const app = setupTest('', Response.json({}));

  await expect(runLoginExchange(app.page)).resolves.toBe('none');
  app.kept.set(SESSION_STORAGE_KEY, 'kettle-session');
  await expect(runLoginExchange(app.page)).resolves.toBe('signed-in');
  expect(app.posted).toStrictEqual([]);
});
