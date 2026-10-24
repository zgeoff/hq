import { expect, mock, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { server } from '../../../mocks/node.ts';
import type { Runner } from '../../runner/types.ts';
import { readSlotReading } from './read-slot-reading.ts';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

function setupTest() {
  const received = mock<(auth: string | null, body: unknown) => void>();
  const run: Runner = async () => ({ code: 0, stdout: 'sk-ant-kettle-slot-0042\n', stderr: '' });

  return { received, run };
}

test('it sends the one-token haiku request with the slot token and keeps the usage headers', async () => {
  const ctx = setupTest();

  server.use(
    http.post(MESSAGES_URL, async ({ request }) => {
      ctx.received(request.headers.get('authorization'), await request.json());

      return HttpResponse.json({}, { headers: { 'anthropic-ratelimit-unified-5h-utilization': '0.2', 'anthropic-ratelimit-unified-5h-reset': '1792000000', 'anthropic-ratelimit-unified-7d-utilization': '0.5', 'anthropic-ratelimit-unified-7d-reset': '1792400000' } });
    }),
  );
  const result = await readSlotReading(ctx.run, 'ops_kettle-profile', 2);

  expect(result).toStrictEqual({ reading: { slot: 2, status: '200', five: 20, fiveResetsAt: '2026-10-14T17:46:40Z', seven: 50, sevenResetsAt: '2026-10-19T08:53:20Z' }, problem: null });
  expect(ctx.received).toHaveBeenCalledTimes(1);
  expect(ctx.received).toHaveBeenCalledWith('Bearer sk-ant-kettle-slot-0042', { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
});

test('it keeps the status and no figures when the slot answers 403 without headers', async () => {
  const ctx = setupTest();

  server.use(http.post(MESSAGES_URL, () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })));

  expect(await readSlotReading(ctx.run, 'ops_kettle-profile', 3)).toStrictEqual({ reading: { slot: 3, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null }, problem: null });
});

test('it makes no request when 1Password gives no token', async () => {
  const requested = mock<() => void>();
  const run: Runner = async () => ({ code: 1, stdout: '', stderr: 'invented: item not found' });

  server.use(http.post(MESSAGES_URL, () => (requested(), HttpResponse.json({}))));
  const result = await readSlotReading(run, 'ops_kettle-profile', 4);

  expect(result).toStrictEqual({ reading: { slot: 4, status: 'op-failed', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null }, problem: 'slot 4: op read gave no token' });
  expect(requested).not.toHaveBeenCalled();
});

test('it reports a failed request without the token', async () => {
  const ctx = setupTest();

  server.use(http.post(MESSAGES_URL, () => HttpResponse.error()));
  const result = await readSlotReading(ctx.run, 'ops_kettle-profile', 1);

  expect(result.reading.status).toBe('request-failed');
  expect(result.problem).toStartWith('slot 1: ');
  expect(result.problem).not.toInclude('sk-ant-kettle-slot-0042');
});
