import { expect, test } from 'bun:test';
import { answerLoginRequest } from './answer-login-request.ts';

test("a login request prints the new link on the console's terminal, and the reply holds no link", () => {
  const printed: string[] = [];

  const reply = answerLoginRequest({ ok: true }, () => 'http://127.0.0.1:4317/#t=kettle-token', (line) => printed.push(line));

  expect(reply).toStrictEqual({ status: 'printed' });
  expect(printed).toStrictEqual(['hq console: open http://127.0.0.1:4317/#t=kettle-token  (one use; it replaces the last link)']);
});

test('a console started off the owner terminal refuses, prints nothing and mints nothing', () => {
  const printed: string[] = [];
  let minted = 0;

  const reply = answerLoginRequest({ ok: false, reason: 'its output is not a terminal' }, () => `kettle-token-${++minted}`, (line) => printed.push(line));

  expect(reply).toStrictEqual({ status: 'refused', reason: 'its output is not a terminal' });
  expect(printed).toStrictEqual([]);
  expect(minted).toBe(0);
});
