import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { updateEnv } from '@zgeoff/testing/helpers';
import { LINEAR_GRAPHQL_URL } from '../../mocks/linear-handlers.ts';
import { server } from '../../mocks/node.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import { resetKey } from './reset-key.ts';

function setupTest() {
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  resetKey();
  onTestFinished(resetKey);
  updateEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token');
  return { run };
}

test.each([
  ['an hour later reuses the key', '2026-10-19T01:00:00Z', 1],
  ['12 hours later reads 1Password again, though Linear answered 200 throughout', '2026-10-19T12:00:00Z', 2],
])('one caller held %s', async (_case, later, count) => {
  const app = setupTest();
  const counter = mock(() => {});
  const linear = makeLinearCaller(app.run, counter);
  updateEnv('HQ_NOW', '2026-10-19T00:00:00Z');
  await linear('q', {});
  updateEnv('HQ_NOW', later);
  await linear('q', {});

  expect([app.run.mock.calls.length, counter.mock.calls.length]).toStrictEqual([count, count]);
});

test.each([401, 403])('it reads 1Password again after Linear answers %i', async (status) => {
  const app = setupTest();
  const linear = makeLinearCaller(app.run, mock(() => {}));
  updateEnv('HQ_NOW', '2026-10-19T00:00:00Z');
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'invented auth refusal' }] }, { status }), { once: true }));
  await linear('q', {}).catch(() => null);
  await linear('q', {});

  expect(app.run.mock.calls).toHaveLength(2);
});

test('a changed Linear item reference reads 1Password again', async () => {
  const app = setupTest();
  const linear = makeLinearCaller(app.run, mock(() => {}));
  updateEnv('HQ_NOW', '2026-10-19T00:00:00Z');
  updateEnv('HQ_LINEAR_OP_REF', 'op://kettle/teapot-key/credential');
  await linear('q', {});
  updateEnv('HQ_LINEAR_OP_REF', 'op://kettle/urn-key/credential');
  await linear('q', {});

  expect(app.run.mock.calls.map(([argv]) => argv)).toStrictEqual([
    ['op', 'read', 'op://kettle/teapot-key/credential'],
    ['op', 'read', 'op://kettle/urn-key/credential'],
  ]);
});
