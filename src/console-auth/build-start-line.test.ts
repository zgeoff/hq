import { expect, test } from 'bun:test';
import { buildStartLine } from './build-start-line.ts';

test('the owner terminal gets a one-use link', () => {
  expect(buildStartLine({ ok: true }, 4317, () => 'http://127.0.0.1:4317/#t=kettle-token')).toBe('hq console: open http://127.0.0.1:4317/#t=kettle-token  (one use; Ctrl-C stops it)');
});

test('a refused terminal gets no token, and no token is minted', () => {
  let minted = 0;

  const line = buildStartLine({ ok: false, reason: 'its output is not a terminal' }, 4317, () => `kettle-token-${++minted}`);

  expect(line).toBe('hq console: http://127.0.0.1:4317/ serves, but prints no login link: its output is not a terminal. Start hq console in your own terminal for one.');
  expect(minted).toBe(0);
});
