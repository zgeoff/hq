import { expect, mock, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { freshDb } from '../../test/helpers.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { makeAuditedLinearCaller } from './make-audited-linear-caller.ts';
import { resetKey } from './reset-key.ts';

function setupTest() {
  const fresh = freshDb();
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(fresh.cleanup);
  process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'invented-token';
  onTestFinished(() => delete process.env['OP_SERVICE_ACCOUNT_TOKEN']);
  onTestFinished(overrideEnv('HQ_LINEAR_OP_REF', 'op://kettle/teapot-key/credential'));
  return { db: fresh.db };
}

test('a 1Password read of the key records one op read event; the cached key records none', async () => {
  const app = setupTest(),
    keyRead = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' })),
    linear = makeAuditedLinearCaller(app.db, keyRead);
  await linear('q', {});
  await linear('q', {});

  expect([keyRead.mock.calls.length, app.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()]).toStrictEqual([1, [{ actor: 'linear', data: '{"consumer":"linear","requests":3}' }]]);
});

test('a failed 1Password read of the key rejects the call and still records one op read event', async () => {
  const app = setupTest(),
    keyRead = mock<Runner>(() => Promise.resolve<RunResult>({ code: 1, stdout: '', stderr: '[ERROR] invented: item not found\n' })),
    linear = makeAuditedLinearCaller(app.db, keyRead);

  await expect(linear('q', {})).rejects.toThrow('op read op://kettle/teapot-key/credential failed (1): [ERROR] invented: item not found');
  expect(app.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'linear', data: '{"consumer":"linear","requests":3}' }]);
});
