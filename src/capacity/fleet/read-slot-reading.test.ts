import { expect, mock, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { ANTHROPIC_MESSAGES_URL, slotUsage } from '../../../mocks/anthropic-handlers.ts';
import { server } from '../../../mocks/node.ts';
import type { Runner } from '../../runner/types.ts';
import { readSlotReading } from './read-slot-reading.ts';

test('it sends the one-token haiku request with the slot token and keeps the usage headers', async () => {
  const received = mock<(authorization: string | null, body: unknown) => void>();
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-slot-0042\n', stderr: '' }));

  slotUsage.set('Bearer sk-ant-kettle-slot-0042', { five: { utilization: 0.2, reset: 1_792_000_000 }, seven: { utilization: 0.5, reset: 1_792_400_000 } });
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(info.request.headers.get('authorization'), body);
    }),
  );
  const result = await readSlotReading({ run, httpClient: fetch }, 'ops_kettle-profile', 2, new AbortController().signal);

  expect(result).toStrictEqual({ reading: { slot: 2, status: '200', five: 20, fiveResetsAt: '2026-10-14T17:46:40Z', seven: 50, sevenResetsAt: '2026-10-19T08:53:20Z' }, problem: null });
  expect(received).toHaveBeenCalledTimes(1);
  expect(received).toHaveBeenCalledWith('Bearer sk-ant-kettle-slot-0042', { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
});

test('it keeps the status and no figures when the slot answers 403 without headers', async () => {
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-slot-0042\n', stderr: '' }));

  server.use(http.post(ANTHROPIC_MESSAGES_URL, () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })));
  const result = await readSlotReading({ run, httpClient: fetch }, 'ops_kettle-profile', 3, new AbortController().signal);

  expect(result).toStrictEqual({ reading: { slot: 3, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null }, problem: null });
});

test('it makes no request when 1Password gives no token', async () => {
  const requested = mock<() => void>();
  const run = mock<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: item not found' }));

  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, () => {
      requested();
    }),
  );
  const result = await readSlotReading({ run, httpClient: fetch }, 'ops_kettle-profile', 4, new AbortController().signal);

  expect(result).toStrictEqual({ reading: { slot: 4, status: 'op-failed', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null }, problem: 'slot 4: op read failed (exit 1)' });
  expect(requested).not.toHaveBeenCalled();
});

test('it reports a failed request without the token', async () => {
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-slot-0042\n', stderr: '' }));

  server.use(http.post(ANTHROPIC_MESSAGES_URL, () => HttpResponse.error()));
  const result = await readSlotReading({ run, httpClient: fetch }, 'ops_kettle-profile', 1, new AbortController().signal);

  expect(result.reading.status).toBe('request-failed');
  expect(result.problem).toStartWith('slot 1: ');
  expect(result.problem).not.toInclude('sk-ant-kettle-slot-0042');
});
