import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRenderedReport } from '../../test/build-rendered-report.ts';
import { freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import type { createConsoleAppRouter } from './create-console-app-router.tsx';
import { overrideEnv } from '../config/override-env.ts';
import { createConsoleServer } from '../create-console-server.ts';
import { createSignedInAuth } from '../../test/create-signed-in-auth.ts';
import { setupPageDOM } from '../../test/setup-page-dom.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';

async function setupTest() {
  const lib = await setupPageDOM('http://127.0.0.1:4317/'),
    tabs = await import('./console-tabs.tsx');
  return { lib, ConsoleTabs: tabs.ConsoleTabs };
}

// The console's own router over a memory history, on a console server with no items and a report.
async function setupAppTest() {
  const fresh = freshDb(),
    signedIn = createSignedInAuth(),
    server = createConsoleServer({
      db: fresh.db,
      auth: signedIn.auth,
      port: 0,
      actor: 'console', run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' }),
      assets: new Map(),
      notify: () => Promise.resolve(true),
      loadShipped: (period) => Promise.resolve({ period, report: buildRenderedReport({ dateLabel: 'The kettle report' }), at: '2026-10-15T02:00:00Z' }),
    }),
    spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(() => server.stop(true));
  const lib = await setupPageDOM(`http://127.0.0.1:${server.port}/`);
  globalThis.sessionStorage.setItem(SESSION_STORAGE_KEY, signedIn.session);
  return lib;
}

test('g s from Needs you opens Shipped, g n returns, and ] and [ step between the pages', async () => {
  const lib = await setupAppTest(),
    page = lib.within(document.body),
    routes = await import('./create-console-app-router.tsx'),
    seen: string[] = [],
    tabRouter = routes.createConsoleAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
  lib.render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={tabRouter} />
    </QueryClientProvider>,
  );
  for (const [keys, shown] of [
    [[], 'Nothing needs you.'],
    [['g', 's'], /^The kettle report:/u],
    [['g', 'n'], 'Nothing needs you.'],
    [[']'], /^The kettle report:/u],
    [['['], 'Nothing needs you.'],
  ] as const) {
    for (const key of keys) {
      lib.act(() => {
        lib.fireEvent.keyDown(document.body, { key });
      });
    }
    await page.findByText(shown);
    seen.push(tabRouter.state.location.pathname);
  }
  expect(seen).toStrictEqual(['/', '/shipped', '/', '/shipped', '/']);
});

test('g s typed in the page\'s note box types text and switches nothing', async () => {
  const lib = await setupAppTest(),
    page = lib.within(document.body),
    routes = await import('./create-console-app-router.tsx'),
    tabRouter = routes.createConsoleAppRouter(createMemoryHistory({ initialEntries: ['/'] })),
    typedNote = await setupNoteBox(lib, tabRouter);

  // A key no handler stops is typed; happy-dom has no typing, so the test adds the text itself.
  for (const key of ['g', ' ', 's', ']']) {
    if (lib.fireEvent.keyDown(typedNote, { key })) {
      lib.fireEvent.change(typedNote, { target: { value: `${typedNote.value}${key}` } });
    }
  }
  await Bun.sleep(50);
  expect([typedNote.value, tabRouter.state.location.pathname, page.queryByText(/^The kettle report:/u)]).toStrictEqual(['g s]', '/', null]);
});

// One call on the Needs you tab, drawn by `tabRouter`; returns the call's note box, focused.
async function setupNoteBox(lib: Awaited<ReturnType<typeof setupPageDOM>>, tabRouter: ReturnType<typeof createConsoleAppRouter>): Promise<HTMLTextAreaElement> {
  await createKettleCall();
  lib.render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={tabRouter} />
    </QueryClientProvider>,
  );
  const note = (await lib.within(document.body).findByLabelText('Note or your own answer')) as HTMLTextAreaElement;
  note.focus();
  return note;
}

// One call on the Needs you tab, so the page shows its note box.
async function createKettleCall(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'hq-tabs-')),
    file = join(dir, 'kettle.json');
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));
  writeFileSync(file, JSON.stringify({ title: 'Mint the kettle tokens', question: 'Mint the kettle tokens tonight?', options: [{ label: 'Yes, mint them', effect: 'The kettle starts at 07:00.', recommended: true }, { label: 'Not yet', effect: 'The kettle waits a day.' }], stuView: 'Minting now keeps the morning boil on time.', details: [] }));
  await main(['call', 'add', 'kettle-mint', '--item', file, '--order', '1', '--json']);
}

test('each tab shows its jump key in the header', async () => {
  const app = await setupTest(),
    drawn = app.lib.render(<app.ConsoleTabs current="shipped" onGo={() => {}} />),
    links = drawn.getAllByRole('link');
  expect(links.map((link) => [link.textContent, link.getAttribute('aria-keyshortcuts'), link.getAttribute('aria-current')])).toStrictEqual([
    ['Needs you g n', 'g n', null],
    ['Shipped g s', 'g s', 'page'],
  ]);
});
