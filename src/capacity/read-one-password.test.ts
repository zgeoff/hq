import { expect, mock, onTestFinished, test } from 'bun:test';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { owner } from '../owner.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { openAlerts } from './open-alerts.ts';
import { readCapacity } from './read-capacity.ts';
import { readingText } from './reading-text.ts';
import { sampleCapacity } from './sample-capacity.ts';
import type { CapacityProbe } from './types.ts';

// Each alert holds for 2 samples; the second comes 5 minutes after the first.
const FOUR_AM_SYDNEY_PLUS_5 = new Date(Date.parse(FOUR_AM_SYDNEY) + 300_000),
  NOON_SYDNEY_PLUS_5 = new Date(Date.parse(NOON_SYDNEY) + 300_000),
  SETTINGS = `${process.env['HOME'] ?? ''}/.claude/settings.json`;

// A database, no 1Password token in the environment, and a probe that answers each command from
// `answers` by its program and each file from `files` by its path, recording every run.
function setupTest() {
  const answers = new Map<string, RunResult>(),
    files = new Map<string, string>(),
    fresh = freshDb(),
    run = mock<Runner>((cmd) => Promise.resolve(answers.get(cmd[0] ?? '') ?? { code: 1, stdout: '', stderr: '' })),
    saved = process.env['OP_SERVICE_ACCOUNT_TOKEN'],
    stub: CapacityProbe = {
      run,
      readText: () => Promise.reject(new Error('no cloud here')),
      readFile: (path) => Promise.resolve(files.get(path) ?? ''),
      readMs: 100,
    };
  onTestFinished(fresh.cleanup);
  delete process.env['OP_SERVICE_ACCOUNT_TOKEN'];
  onTestFinished(() => {
    if (saved !== undefined) {
      process.env['OP_SERVICE_ACCOUNT_TOKEN'] = saved;
    }
  });
  return {
    answers,
    db: fresh.db,
    files,
    probe: stub,
    readOwnerOutbox: () => (fresh.db.query('SELECT text FROM outbox WHERE target = ? ORDER BY id').all(owner()) as { text: string }[]).map((message) => message.text),
    run,
  };
}

test('it runs op service-account ratelimit with the token from ~/.claude/settings.json', async () => {
  const app = setupTest();
  app.answers.set('op', { code: 0, stdout: '[{"type":"account","action":"read_write","limit":1000,"used":120,"remaining":880,"reset":41269}]', stderr: '' });
  app.files.set(SETTINGS, '{"env":{"OP_SERVICE_ACCOUNT_TOKEN":"ops_invented-kettle-0042"}}');

  await expect(readCapacity(app.db, app.probe, new Date(NOON_SYDNEY))).resolves.toMatchObject({ op_account_used: 120, op_account_limit: 1000, op_refused: 0 });
  expect(app.run).toHaveBeenCalledWith(['op', 'service-account', 'ratelimit', '--format', 'json'], { env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_invented-kettle-0042' }, timeoutMs: 100 });
});

test.each([
  ['under half the daily limit opens nothing', { code: 0, stdout: '[{"type":"token","action":"read","limit":10000,"used":3,"remaining":9997,"reset":0},{"type":"account","action":"read_write","limit":1000,"used":499,"remaining":501,"reset":41269}]', stderr: '' }, [], ''],
  ['at half the daily limit opens the daily alert', { code: 0, stdout: '[{"type":"token","action":"read","limit":10000,"used":3,"remaining":9997,"reset":0},{"type":"account","action":"read_write","limit":1000,"used":500,"remaining":500,"reset":41269}]', stderr: '' }, ['op:daily'], '- 1Password: 500 of 1,000 requests today, at or over 50%'],
  ['with the daily limit spent opens both alerts', { code: 0, stdout: '[{"type":"token","action":"read","limit":10000,"used":3,"remaining":9997,"reset":0},{"type":"account","action":"read_write","limit":1000,"used":1000,"remaining":0,"reset":41269}]', stderr: '' }, ['op:daily', 'op:refused'], '- 1Password is refusing requests: a limit is spent.'],
  ['with only the token\'s hourly limit spent opens the refused alert', { code: 0, stdout: '[{"type":"token","action":"read","limit":10000,"used":10000,"remaining":0,"reset":600},{"type":"account","action":"read_write","limit":1000,"used":499,"remaining":501,"reset":41269}]', stderr: '' }, ['op:refused'], '1Password is refusing requests: a limit is spent.'],
  ['rate-limited itself opens the refused alert', { code: 1, stdout: '', stderr: '[ERROR] 2026/10/19 05:42:13 Too many requests. Your client has been rate-limited.' }, ['op:refused'], '1Password is refusing requests: a limit is spent.'],
])('1Password %s', async (_case, answer, keys, line) => {
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  const app = setupTest();
  app.answers.set('op', answer);
  app.files.set(SETTINGS, '{"env":{"OP_SERVICE_ACCOUNT_TOKEN":"invented-token"}}');

  await expect(sampleCapacity(app.db, app.probe, 'hq-lanes', new Date(NOON_SYDNEY))).resolves.toMatchObject({ tick: { opened: [] } });
  await expect(sampleCapacity(app.db, app.probe, 'hq-lanes', NOON_SYDNEY_PLUS_5)).resolves.toMatchObject({ tick: { opened: keys } });
  expect(Object.keys(openAlerts(app.db)).toSorted()).toStrictEqual(keys);
  expect(app.readOwnerOutbox().join('\n')).toContain(line);
});

test('in quiet hours a spent limit sends the refused alert at once and holds the daily one', async () => {
  onTestFinished(overrideEnv('HQ_NOW', FOUR_AM_SYDNEY));
  const app = setupTest();
  app.answers.set('op', { code: 0, stdout: '[{"type":"account","action":"read_write","limit":1000,"used":1000,"remaining":0,"reset":41269}]', stderr: '' });
  app.files.set(SETTINGS, '{"env":{"OP_SERVICE_ACCOUNT_TOKEN":"invented-token"}}');

  await expect(sampleCapacity(app.db, app.probe, 'hq-lanes', new Date(FOUR_AM_SYDNEY))).resolves.toMatchObject({ tick: { opened: [] } });
  await expect(sampleCapacity(app.db, app.probe, 'hq-lanes', FOUR_AM_SYDNEY_PLUS_5)).resolves.toMatchObject({ tick: { opened: ['op:daily', 'op:refused'] } });
  expect(app.readOwnerOutbox()).toStrictEqual([expect.stringContaining('1Password is refusing requests')]);
});

test.each([
  ['no token', '{"env":{}}'],
  ['a settings file that is not JSON', '{"env":{"OP_SERVICE_ACCOUNT_TOKEN":"ops_invented-secret-0042"'],
])('with %s, the reading stores no 1Password use and says why, never quoting the file', async (_case, settings) => {
  const app = setupTest();
  app.files.set(SETTINGS, settings);

  await expect(readCapacity(app.db, app.probe, new Date(NOON_SYDNEY))).resolves.toMatchObject({ op_account_used: null, op_refused: null, errors: { op: 'no 1Password service-account token in ~/.claude/settings.json: op-mint global' } });
  expect(app.run.mock.calls.some((call) => call[0][0] === 'op')).toBe(false);
});

test.each([
  ['a reading', { code: 0, stdout: '[{"type":"account","action":"read_write","limit":1000,"used":120,"remaining":880,"reset":41269}]', stderr: '' }, '  1Pass    120 of 1,000 requests today'],
  ['a spent limit', { code: 0, stdout: '[{"type":"account","action":"read_write","limit":1000,"used":1000,"remaining":0,"reset":41269}]', stderr: '' }, '  1Pass    1,000 of 1,000 requests today, refusing requests'],
  ['op rate-limited', { code: 1, stdout: '', stderr: 'Too many requests' }, '  1Pass    no reading, refusing requests'],
  ['op failing', { code: 1, stdout: '', stderr: 'vault not found' }, '  1Pass    no reading'],
])('hq capacity shows 1Password with %s', async (_case, answer, line) => {
  const app = setupTest();
  app.answers.set('op', answer);
  app.files.set(SETTINGS, '{"env":{"OP_SERVICE_ACCOUNT_TOKEN":"invented-token"}}');

  await expect(readCapacity(app.db, app.probe, new Date(NOON_SYDNEY)).then((reading) => readingText(reading).split('\n').find((text) => text.startsWith('  1Pass')))).resolves.toBe(line);
});
