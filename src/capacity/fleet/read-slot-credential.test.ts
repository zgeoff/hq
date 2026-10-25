import { expect, mock, test } from 'bun:test';
import type { Runner } from '../../runner/types.ts';
import { readSlotCredential } from './read-slot-credential.ts';

test('it reads the slot token from its 1Password item with the profile token', async () => {
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-slot-0042\n', stderr: '' }));

  const credential = await readSlotCredential(run, 'ops_kettle-profile', 2, new AbortController().signal);

  expect(credential).toStrictEqual({ kind: 'ready', credential: 'sk-ant-kettle-slot-0042' });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith(['op', 'read', 'op://claude-slots/claude-setup-token-2/credential'], { env: expect.objectContaining({ OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile' }), signal: expect.any(AbortSignal) });
});

test.each([
  ['an auth failure', '[ERROR] invented: authentication required for ops_kettle-profile', 'op read failed (exit 1): re-mint with op-mint hq'],
  ['a 401', 'invented: 401 Unauthorized for ops_kettle-profile', 'op read failed (exit 1): re-mint with op-mint hq'],
  ['a rate limit', 'invented: Too many requests for ops_kettle-profile', "op read failed (exit 1): 1Password's rate limit; op service-account ratelimit shows which limit and when it resets"],
  ['any other failure', 'invented: item not found in ops_kettle-profile', 'op read failed (exit 1)'],
  ['a missing item that names its reference', '[ERROR] invented: could not read "op://claude-slots/claude-setup-token-2/credential": isn\'t an item', 'op read failed (exit 1)'],
  ['an auth failure that also names its reference', '[ERROR] invented: op://claude-slots/claude-setup-token-2/credential: 401 Unauthorized', 'op read failed (exit 1): re-mint with op-mint hq'],
])('it words %s from stderr without quoting it', async (_label, stderr, reason) => {
  const run = mock<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr }));

  const credential = await readSlotCredential(run, 'ops_kettle-profile', 3, new AbortController().signal);

  expect(credential).toStrictEqual({ kind: 'failed', reason });
});

test('it fails a read that exits 0 with no token', async () => {
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: '\n', stderr: '' }));

  const credential = await readSlotCredential(run, 'ops_kettle-profile', 4, new AbortController().signal);

  expect(credential).toStrictEqual({ kind: 'failed', reason: 'op read gave no token' });
});
