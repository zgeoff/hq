import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import { buildRenderedReport } from '../../test/build-rendered-report.ts';
import { freshDb } from '../../test/helpers.ts';
import { createSignedInAuth } from '../../test/create-signed-in-auth.ts';
import { setupPageDOM } from '../../test/setup-page-dom.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';
import { createConsoleServer } from '../create-console-server.ts';
import type { ShippedPeriod } from '../shipped/types.ts';

async function setupTest(asked: ShippedPeriod[]) {
  const fresh = freshDb(),
    signedIn = createSignedInAuth(),
    server = createConsoleServer({
      db: fresh.db,
      auth: signedIn.auth,
      port: 0,
      actor: 'console', run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' }),
      assets: new Map(),
      notify: () => Promise.resolve(true),
      loadShipped: (period) => {
        asked.push(period);
        return Promise.resolve({ period, report: buildRenderedReport({ dateLabel: `The kettle report for ${period}` }), at: '2026-10-15T02:00:00Z' });
      },
    }),
    spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(() => server.stop(true));
  const lib = await setupPageDOM(`http://127.0.0.1:${server.port}/shipped`);
  globalThis.sessionStorage.setItem(SESSION_STORAGE_KEY, signedIn.session);
  return lib;
}

test('Shipped opens on today; a click on Yesterday and the w key each read and show their period', async () => {
  const asked: ShippedPeriod[] = [],
    lib = await setupTest(asked),
    page = lib.within(document.body),
    view = await import('./shipped-view.tsx');
  lib.render(
    <QueryClientProvider client={new QueryClient()}>
      <view.ShippedView />
    </QueryClientProvider>,
  );
  await page.findByText(/^The kettle report for today:/u);
  lib.fireEvent.click(page.getByRole('button', { name: /Yesterday/u }));
  await page.findByText(/^The kettle report for yesterday:/u);
  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: 'w' });
  });
  await page.findByText(/^The kettle report for week:/u);
  expect([asked, page.getByRole('button', { name: /This week/u }).getAttribute('aria-pressed')]).toStrictEqual([['today', 'yesterday', 'week'], 'true']);
});

test('an open page reads its report again on its own, so a new day shows without a click', async () => {
  const asked: ShippedPeriod[] = [],
    lib = await setupTest(asked),
    view = await import('./shipped-view.tsx');

  // Query took this process for a server when it loaded, before the page's DOM, and a server
  // schedules no refresh; the browser page is a client.
  environmentManager.setIsServer(() => false);
  onTestFinished(() => environmentManager.setIsServer(() => true));
  lib.render(
    <QueryClientProvider client={new QueryClient()}>
      <view.ShippedView refreshMs={150} />
    </QueryClientProvider>,
  );
  await lib.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(3));
  expect(new Set(asked)).toStrictEqual(new Set(['today']));
});

test('? lists the Shipped keys and the keys every tab shares, and Esc closes the list', async () => {
  const lib = await setupTest([]),
    page = lib.within(document.body),
    view = await import('./shipped-view.tsx');
  lib.render(
    <QueryClientProvider client={new QueryClient()}>
      <view.ShippedView />
    </QueryClientProvider>,
  );
  await page.findByText(/^The kettle report for today:/u);
  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: '?' });
  });
  expect(Array.from(page.getByRole('dialog', { name: 'Keyboard shortcuts' }).querySelectorAll('kbd'), (kbd) => kbd.textContent)).toStrictEqual(['t / y / w', 'Esc', 'g n / g s', '[ / ]', '?']);
  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: 'Escape' });
  });
  expect(page.queryByRole('dialog')).toBeNull();
});
