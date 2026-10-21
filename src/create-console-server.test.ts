import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { buildRenderedReport } from '../test/build-rendered-report.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { getAsk } from './asks/get-ask.ts';
import type { ConsoleRouter } from './build-console-router.ts';
import { main } from './cli.ts';
import { overrideEnv } from './config/override-env.ts';
import { createConsoleServer } from './create-console-server.ts';
import type { ConsoleServerInput } from './create-console-server.ts';
import type { ShippedPeriod } from './shipped/types.ts';
import { roleName } from './roles/role-name.ts';
import { getUnblock } from './unblock/get-unblock.ts';
import { FAKE_FULL_SHA, buildFakeRunner } from '../test/noslop-fake.ts';
import { createUnblockItems } from '../test/create-unblock-items.ts';

const KETTLE_CALL = {
    title: 'Mint the kettle tokens',
    question: 'Mint the `kettle` tokens tonight?',
    options: [
      { label: 'Yes, mint them', effect: 'The kettle starts at 07:00.', recommended: true },
      { label: 'Not yet', effect: 'The kettle waits a day.' },
    ],
    stuView: 'Minting now keeps the morning boil on time.',
    details: [{ heading: 'Evidence', text: 'The last boil took 9 min.' }],
  },
  PAGE = '<!doctype html><div id="root"></div>';

function setupTest(told = true, loadShipped: ConsoleServerInput['loadShipped'] = () => Promise.reject(new Error('no report in this test')), run: ConsoleServerInput['run'] = () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' })) {
  const fresh = freshDb(),
    server = createConsoleServer({ db: fresh.db, port: 0, actor: 'console', run, assets: new Map([['/', () => new Response(PAGE)]]), notify: () => Promise.resolve(told), loadShipped }),
    spy = spyOn(console, 'log').mockImplementation(() => {}),
    url = `http://127.0.0.1:${server.port}`;
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(() => server.stop(true));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));
  return {
    db: fresh.db,
    base: url,
    client: createORPCClient(new RPCLink({ url: `${url}/rpc` })) as RouterClient<ConsoleRouter>,
    addCall: async (id: string, item: unknown = KETTLE_CALL) => {
      const file = join(fresh.dir, `${id}.json`);
      writeFileSync(file, JSON.stringify(item));
      await main(['call', 'add', id, '--item', file, '--json']);
    },
  };
}

test('a foreign Host is refused for the page and the API alike, and a foreign Origin for the API', async () => {
  const app = setupTest(),
    foreignAPI = await fetch(`${app.base}/rpc/items/list`, { method: 'POST', headers: { host: 'kettle.example', 'content-type': 'application/json' }, body: '{}' }),
    foreignOrigin = await fetch(`${app.base}/rpc/items/list`, { method: 'POST', headers: { origin: 'http://kettle.example', 'content-type': 'application/json' }, body: '{}' }),
    foreignPage = await fetch(`${app.base}/`, { headers: { host: 'kettle.example' } }),
    page = await fetch(`${app.base}/`),
    pageText = await page.text();

  expect(page.status).toBe(200);
  expect(pageText).toBe(PAGE);
  expect([foreignPage.status, foreignAPI.status, foreignOrigin.status]).toStrictEqual([403, 403, 403]);
});

test.each([
  ['GET', '/', { host: 'kettle.example' }],
  ['GET', '/', { host: '127.0.0.1:1' }],
  ['GET', '/', { host: 'localhost' }],
  ['GET', '/', { host: '127.0.0.1.kettle.example' }],
  ['GET', '/', { host: '[::1]' }],
  ['POST', '/rpc/items/list', { host: 'kettle.example' }],
  ['POST', '/rpc/items/list', { origin: 'http://kettle.example' }],
  ['POST', '/rpc/items/list', { origin: 'null' }],
  ['POST', '/rpc/items/answer', { origin: 'https://kettle.example' }],
  ['POST', '/rpc/unblock/mark', { origin: 'http://localhost:1' }],
])('a hostile request is refused before it reaches hq: %s %s %o', async (method, path, headers) => {
  const app = setupTest(),
    response = await fetch(`${app.base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: '{"json":{"id":"kettle-mint","option":"","note":"x","mark":"done"}}' } : {}) });

  expect(response.status).toBe(403);
  expect(app.db.query('SELECT COUNT(*) AS n FROM events').get()).toStrictEqual({ n: 0 });
});

test('the Shipped tab: its path serves the page, its report comes through the API, and a foreign Host or Origin is refused', async () => {
  const asked: ShippedPeriod[] = [],
    booted = setupTest(true, (period) => {
      asked.push(period);
      return period === 'yesterday' ? Promise.reject(new Error('merged-prs.sh exited 1: gh: not logged in')) : Promise.resolve({ period, report: buildRenderedReport(), at: NOON_SYDNEY });
    }),
    failed = await booted.client.shipped.report({ period: 'yesterday' }).catch((error: unknown) => (error as Error).message),
    foreignHost = await fetch(`${booted.base}/rpc/shipped/report`, { method: 'POST', headers: { host: 'kettle.example', 'content-type': 'application/json' }, body: '{"json":{"period":"today"}}' }),
    foreignOrigin = await fetch(`${booted.base}/rpc/shipped/report`, { method: 'POST', headers: { origin: 'http://kettle.example', 'content-type': 'application/json' }, body: '{"json":{"period":"today"}}' }),
    page = await fetch(`${booted.base}/shipped`),
    pageText = await page.text(),
    report = await booted.client.shipped.report({ period: 'week' });
  expect([page.status, pageText]).toStrictEqual([200, PAGE]);
  expect([report, failed]).toStrictEqual([{ period: 'week', report: buildRenderedReport(), at: NOON_SYDNEY }, 'merged-prs.sh exited 1: gh: not logged in']);
  expect([foreignHost.status, foreignOrigin.status, asked]).toStrictEqual([403, 403, ['yesterday', 'week']]);
});

test('no response may load in another site\'s frame', async () => {
  const app = setupTest(),
    page = await fetch(`${app.base}/`),
    refused = await fetch(`${app.base}/`, { headers: { host: 'kettle.example' } }),
    rpc = await fetch(`${app.base}/rpc/items/list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

  for (const response of [page, rpc, refused]) {
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  }
});

test('an option and a note record the same row `hq call open` and `hq call answer` write', async () => {
  const app = setupTest();
  await app.addCall('kettle-mint');
  await app.addCall('kettle-twin');
  await expect(app.client.items.answer({ id: 'kettle-mint', option: 'Not yet', note: ' Ask again on Monday.\nNot before.' })).resolves.toStrictEqual({ id: 'kettle-mint', answer: 'Not yet |  Ask again on Monday.\nNot before.', told: true });
  await main(['call', 'open', 'kettle-twin', '--json']);
  await main(['call', 'answer', 'kettle-twin', '--answer', 'Not yet |  Ask again on Monday.\nNot before.', '--json']);

  expect({ ...getAsk(app.db, 'kettle-mint'), id: 'x', send_order: 0 }).toStrictEqual({ ...getAsk(app.db, 'kettle-twin'), id: 'x', send_order: 0 });
});

test('it answers a queued call while another call is open with the owner, and that one stays open', async () => {
  const app = setupTest();
  await app.addCall('kettle-a');
  await app.addCall('kettle-b');
  await main(['call', 'open', 'kettle-a', '--json']);
  await app.client.items.answer({ id: 'kettle-b', option: 'Yes, mint them', note: '' });

  expect(getAsk(app.db, 'kettle-a')?.state).toBe('open');
  expect(getAsk(app.db, 'kettle-b')).toMatchObject({ state: 'answered', answer: 'Yes, mint them', opened_at: '2026-10-14T01:00:00Z' });
  expect(app.db.query("SELECT action, from_state, to_state FROM events WHERE subject_id = 'kettle-b' AND to_state = 'answered'").all()).toStrictEqual([
    { action: 'answered-unopened', from_state: 'queued', to_state: 'answered' },
  ]);
});

test('the owner session gets one message per answer, and the page hears when it failed', async () => {
  const app = setupTest(false);
  await app.addCall('kettle-mint');

  await expect(app.client.items.answer({ id: 'kettle-mint', option: 'Yes, mint them', note: 'Read-only.' })).resolves.toMatchObject({ told: false });
  expect(app.db.query("SELECT target, text FROM outbox WHERE text LIKE 'console answer:%'").all()).toStrictEqual([{ target: roleName('owner'), text: 'console answer: call kettle-mint: Yes, mint them | Read-only.' }]);
});

test('a free-text call takes a note alone, and an option no item offers is refused', async () => {
  const app = setupTest();
  await main(['call', 'add', 'kettle-old', '--title', 'Old kettle', '--question', 'Keep the old kettle?', '--body', 'It leaks a little.', '--json']);
  await app.addCall('kettle-mint');

  await expect(app.client.items.answer({ id: 'kettle-old', option: 'Yes', note: '' })).rejects.toThrow();
  await expect(app.client.items.answer({ id: 'kettle-mint', option: '', note: ' ' })).rejects.toThrow();
  await app.client.items.answer({ id: 'kettle-old', option: '', note: 'Keep it a week.' });
  expect(getAsk(app.db, 'kettle-old')).toMatchObject({ state: 'answered', answer: 'Keep it a week.' });
  expect(getAsk(app.db, 'kettle-mint')?.state).toBe('queued');
});

test('a to-do marked Done, Later or Skip lands as `hq unblock done`, `later` and `drop` would', async () => {
  const app = setupTest();
  for (const id of ['lid', 'steam', 'spout']) {
    await main(['unblock', 'add', '--id', id, '--task', `Check the kettle ${id}`, '--json']);
  }
  await app.client.unblock.mark({ id: 'lid', mark: 'done', note: 'Fitted.' });
  await app.client.unblock.mark({ id: 'steam', mark: 'later', note: '' });
  await app.client.unblock.mark({ id: 'spout', mark: 'skip', note: '' });

  expect(getUnblock(app.db, 'lid')).toMatchObject({ state: 'done', note: 'Fitted.' });
  expect(getUnblock(app.db, 'steam')).toMatchObject({ state: 'open', due_at: '2026-10-14T20:00:00Z' });
  expect(getUnblock(app.db, 'spout')?.state).toBe('dropped');
  await expect(app.client.items.list()).resolves.toStrictEqual([]);
  expect(app.db.query("SELECT text FROM outbox WHERE text LIKE 'console answer:%' ORDER BY id").values().flat()).toStrictEqual([
    'console answer: todo lid: Done | Fitted.',
    'console answer: todo steam: Later',
    'console answer: todo spout: Skip',
  ]);
});

test('it writes a review answer through the API to the PR record, sourced from the item', async () => {
  const app = setupTest(true, undefined, buildFakeRunner().run);
  createUnblockItems(app.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } });

  await app.client.unblock.review({ id: 'review-4', review: 'changes', note: 'Descale it first.' });

  expect(app.db.query('SELECT repo, pr, answer, answer_head, answer_source, answer_note FROM pr_status').all()).toStrictEqual([
    { repo: 'kettle', pr: 4, answer: 'changes', answer_head: FAKE_FULL_SHA, answer_source: 'console:review-4', answer_note: 'Descale it first.' },
  ]);
});

test('it tells the owner session about a review answer when gh times out reading the head', async () => {
  const app = setupTest(true, undefined, () => Promise.resolve({ code: 124, stdout: '', stderr: 'gh timed out after 60 s' }));
  createUnblockItems(app.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } });

  await expect(app.client.unblock.review({ id: 'review-4', review: 'lgtm', note: '' })).resolves.toStrictEqual({ id: 'review-4', state: 'done', told: true });

  expect(app.db.query('SELECT head, answer FROM pr_status').all()).toStrictEqual([{ head: null, answer: 'lgtm' }]);
});

test('it tells the owner session about a review answer when the gh call itself fails', async () => {
  const app = setupTest(true, undefined, () => Promise.reject(new Error('spawn gh ENOENT')));
  createUnblockItems(app.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } });

  await expect(app.client.unblock.review({ id: 'review-4', review: 'lgtm', note: '' })).resolves.toStrictEqual({ id: 'review-4', state: 'done', told: true });
});

test('it tells the owner session about a review answer when the PR record cannot be written', async () => {
  const app = setupTest(true, undefined, buildFakeRunner().run);
  createUnblockItems(app.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } });
  app.db.exec('DROP TABLE pr_status');

  await expect(app.client.unblock.review({ id: 'review-4', review: 'lgtm', note: '' })).resolves.toStrictEqual({ id: 'review-4', state: 'done', told: true });
});
