import { expect, mock, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import { resetKey } from './reset-key.ts';

function setupTest() {
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  resetKey();
  onTestFinished(resetKey);
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  onTestFinished(() => delete process.env['OP_SERVICE_ACCOUNT_TOKEN']);
  return { run };
}

test.each([
  ['an hour later reuses the key', '2026-10-19T01:00:00Z', 1],
  ['12 hours later reads 1Password again, though Linear answered 200 throughout', '2026-10-19T12:00:00Z', 2],
])('one caller held %s', async (_case, later, count) => {
  const app = setupTest(),
    counter = mock(() => {}),
    linear = makeLinearCaller(app.run, fetch, counter);
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-19T00:00:00Z'));
  await linear('q', {});
  onTestFinished(overrideEnv('HQ_NOW', later));
  await linear('q', {});

  expect([app.run.mock.calls.length, counter.mock.calls.length]).toStrictEqual([count, count]);
});

test('a changed Linear item reference reads 1Password again', async () => {
  const app = setupTest(),
    linear = makeLinearCaller(app.run, fetch, mock(() => {}));
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-19T00:00:00Z'));
  onTestFinished(overrideEnv('HQ_LINEAR_OP_REF', 'op://kettle/teapot-key/credential'));
  await linear('q', {});
  onTestFinished(overrideEnv('HQ_LINEAR_OP_REF', 'op://kettle/urn-key/credential'));
  await linear('q', {});

  expect(app.run.mock.calls.map(([argv]) => argv)).toStrictEqual([
    ['op', 'read', 'op://kettle/teapot-key/credential'],
    ['op', 'read', 'op://kettle/urn-key/credential'],
  ]);
});
