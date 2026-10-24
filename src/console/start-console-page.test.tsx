import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { freshDb } from '../../test/helpers.ts';
import { setupPageDOM } from '../../test/setup-page-dom.ts';
import { createConsoleAuth } from '../console-auth/create-console-auth.ts';
import type { ConsoleAuth } from '../console-auth/create-console-auth.ts';
import { createConsoleServer } from '../create-console-server.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';

// The real page start against a console server, from a tab at `hash`, rendered into the page DOM.
async function setupTest(hash: (auth: ConsoleAuth) => string) {
  const fresh = freshDb();
  const auth = createConsoleAuth();
  const server = createConsoleServer({ db: fresh.db, auth, port: 0, actor: 'console', run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' }), assets: new Map(), notify: () => Promise.resolve(true), loadShipped: () => Promise.reject(new Error('no report in this test')) });
  const spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(() => server.stop(true));
  const lib = await setupPageDOM(`http://127.0.0.1:${server.port}/`);
  const page = await import('./start-console-page.tsx');
  const routes = await import('./create-console-app-router.tsx');
  const outcome = await page.startConsolePage({
    render: (view) => void lib.render(view),
    router: routes.createConsoleAppRouter(createMemoryHistory({ initialEntries: ['/'] })),
    queryClient: new QueryClient(),
    login: {
      hash: hash(auth),
      origin: `http://127.0.0.1:${server.port}`,
      storage: () => globalThis.sessionStorage,
      clearHash: () => {},
      post: (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    },
  });
  return { lib, auth, outcome };
}

test('a fresh login link opens the console view and keeps the session in the tab', async () => {
  const app = await setupTest((auth) => `#t=${auth.mintLogin()}`);

  await app.lib.within(document.body).findByText('Nothing needs you.');

  expect(app.outcome).toBe('signed-in');
  expect(globalThis.sessionStorage.getItem(SESSION_STORAGE_KEY)).toMatch(/^[\w-]{43}$/u);
});

test('a tab with no link and no session sees how to sign in, and no console view', async () => {
  const app = await setupTest(() => '');

  await app.lib.within(document.body).findByText('Sign in to hq console');

  expect(app.lib.within(document.body).queryByText('Nothing needs you.')).toBeNull();
});

test('a link that was already used shows the refusal and how to get a new one', async () => {
  const app = await setupTest((auth) => {
    const token = auth.mintLogin();
    auth.exchange(token);
    return `#t=${token}`;
  });

  await app.lib.within(document.body).findByText('That login link is used or unknown.');

  expect(app.outcome).toBe('refused');
});
