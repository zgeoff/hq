import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { createSignedInAuth } from '../../test/create-signed-in-auth.ts';
import { setupPageDOM } from '../../test/setup-page-dom.ts';
import { createConsoleAPI } from './console-api.ts';
import { ConsoleAPIContext } from './console-api-context.ts';
import { getAsk } from '../asks/get-ask.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { createConsoleServer } from '../create-console-server.ts';
import { getUnblock } from '../unblock/get-unblock.ts';

const KETTLE_CALL = {
  title: 'Mint the kettle tokens',
  question: 'Mint the kettle tokens tonight?',
  options: [
    { label: 'Yes, mint them', effect: 'The kettle starts at 07:00.', recommended: true },
    { label: 'Not yet', effect: 'The kettle waits a day.' },
  ],
  stuView: 'Minting now keeps the morning boil on time.',
  details: [],
};

async function setupTest() {
  const fresh = freshDb(),
    signedIn = createSignedInAuth(),
    server = createConsoleServer({ db: fresh.db, auth: signedIn.auth, port: 0, actor: 'console', run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' }), assets: new Map(), notify: () => Promise.resolve(true), loadShipped: () => Promise.reject(new Error('no report in this test')) }),
    spy = spyOn(console, 'log').mockImplementation(() => {});
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(() => server.stop(true));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));
  for (const [id, order, question] of [['kettle-mint', '1', KETTLE_CALL.question], ['constructor', '2', 'Fit the long spout?']] as const) {
    const file = join(fresh.dir, `${id}.json`);
    writeFileSync(file, JSON.stringify({ ...KETTLE_CALL, title: id === 'kettle-mint' ? KETTLE_CALL.title : question, question }));
    await main(['call', 'add', id, '--item', file, '--order', order, '--json']);
  }
  await main(['unblock', 'add', '--id', 'lid', '--task', 'Fit the new lid on the kettle', '--json']);
  const library = await setupPageDOM(`http://127.0.0.1:${server.port}/`);
  return { db: fresh.db, directory: fresh.dir, library: { ...library, api: createConsoleAPI(() => signedIn.session) } };
}

test('the owner answers by click, key and note, Ask Stu copies its prompt, a review takes review words, and a to-do put off comes back when due', async () => {
  const app = await setupTest(),
    lib = app.library,
    queryClient = new QueryClient(),
    view = await import('./needs-you-view.tsx'),
    write = spyOn(navigator.clipboard, 'writeText');
  createUnblockItems(app.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  lib.render(
    <ConsoleAPIContext value={lib.api}>
    <QueryClientProvider client={queryClient}>
      <view.NeedsYouView />
    </QueryClientProvider>
    </ConsoleAPIContext>,
  );
  await lib.within(document.body).findByText('Mint the kettle tokens tonight?');

  expect(lib.within(document.body).getByText('Mint the kettle tokens')).toBeTruthy();

  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: 'y' });
  });
  await lib.within(document.body).findByText('Copied, paste to Stu');

  expect(write).toHaveBeenLastCalledWith('hey stu, I want to chat about kettle-mint (Mint the kettle tokens)');

  write.mockRejectedValueOnce(new Error('denied'));
  lib.fireEvent.click(lib.within(document.body).getByRole('button', { name: /Copied, paste to Stu/u }));
  await lib.within(document.body).findByText('Could not copy. Paste this to Stu: hey stu, I want to chat about kettle-mint (Mint the kettle tokens)');

  expect(lib.within(document.body).getByRole('status').dataset['tone']).toBe('warn');

  lib.fireEvent.change(lib.within(document.body).getByLabelText('Note or your own answer'), { target: { value: ' Read-only, please.' } });
  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: 'j' });
  });
  await lib.within(document.body).findByText('Fit the long spout?');

  expect((lib.within(document.body).getByLabelText('Note or your own answer') as HTMLTextAreaElement).value).toBe('');

  lib.fireEvent.keyDown(lib.within(document.body).getByLabelText('Note or your own answer'), { key: 'Enter' });

  expect(getAsk(app.db, 'constructor')?.state).toBe('queued');
  expect(lib.within(document.body).getByText('Fit the long spout?')).toBeTruthy();

  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: 'k' });
  });
  await lib.within(document.body).findByText('Mint the kettle tokens tonight?');
  lib.fireEvent.click(lib.within(document.body).getByRole('button', { name: /Yes, mint them/u }));
  await lib.within(document.body).findByText('Fit the long spout?');
  await lib.waitFor(() => expect(getAsk(app.db, 'kettle-mint')?.answer).toBe('Yes, mint them |  Read-only, please.'));

  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: '2' });
  });
  await lib.within(document.body).findByText('Fit the new lid on the kettle');
  expect(getAsk(app.db, 'constructor')).toMatchObject({ state: 'answered', answer: 'Not yet' });

  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: '2' });
  });
  await lib.within(document.body).findByText('Review kettle#4 and say lgtm');

  expect(['lgtm', 'Changes', 'Later', 'Reject'].map((name) => lib.within(document.body).getByRole('button', { name: new RegExp(`^${name}`, 'u') }).getAttribute('aria-keyshortcuts'))).toStrictEqual(['1', '2', '3', null]);
  expect(lib.within(document.body).getByRole('button', { name: /^Reject/u }).querySelector('kbd')).toBeNull();

  lib.act(() => {
    lib.fireEvent.keyDown(document.body, { key: '4' });
  });
  lib.fireEvent.click(lib.within(document.body).getByRole('button', { name: /^Changes/u }));
  await lib.within(document.body).findByText('Changes needs a note: say what to change.');

  expect(getUnblock(app.db, 'review-4')?.state).toBe('open');
  expect(document.activeElement).toBe(lib.within(document.body).getByLabelText('Note or your own answer'));

  lib.fireEvent.change(lib.within(document.body).getByLabelText('Note or your own answer'), { target: { value: 'Descale it first.' } });
  lib.fireEvent.click(lib.within(document.body).getByRole('button', { name: /^Changes/u }));
  await lib.within(document.body).findByText('Nothing needs you.');

  expect(getUnblock(app.db, 'review-4')).toMatchObject({ state: 'done', note: 'Changes | Descale it first.' });

  at('2026-10-14T20:01:00Z');
  await lib.act(async () => {
    await queryClient.invalidateQueries();
  });
  await lib.within(document.body).findByText('Fit the new lid on the kettle');
});

test('it shows an item that arrives while the page stays open', async () => {
  const app = await setupTest();
  const queryClient = new QueryClient();
  const view = await import('./needs-you-view.tsx');

  // Query took this process for a server when it loaded, and a server schedules no refresh.
  environmentManager.setIsServer(() => false);
  onTestFinished(() => environmentManager.setIsServer(() => true));
  app.library.render(
    <ConsoleAPIContext value={app.library.api}>
    <QueryClientProvider client={queryClient}>
      <view.NeedsYouView refreshMs={100} />
    </QueryClientProvider>
    </ConsoleAPIContext>,
  );
  await app.library.within(document.body).findByText('Mint the kettle tokens tonight?');
  const file = join(app.directory, 'descale.json');
  writeFileSync(file, JSON.stringify({ ...KETTLE_CALL, title: 'Descale the kettle', question: 'Descale the kettle first?' }));
  await main(['call', 'add', 'descale', '--item', file, '--order', '0', '--json']);

  const shown = await app.library.within(document.body).findByText('Descale the kettle first?', {}, { timeout: 3000 });

  expect(shown).toBeTruthy();
});
