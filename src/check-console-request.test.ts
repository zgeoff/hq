import { expect, test } from 'bun:test';
import { checkConsoleRequest } from './check-console-request.ts';

function buildRequest(headers: Record<string, string>): Request {
  const req = new Request('http://127.0.0.1:4317/rpc/items/list', { method: 'POST' });
  for (const [name, value] of Object.entries(headers)) {
    req.headers.set(name, value);
  }
  return req;
}

test.each([
  [{ host: '127.0.0.1:4317' }],
  [{ host: 'localhost:4317' }],
  [{ host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317' }],
  [{ host: 'localhost:4317', origin: 'http://localhost:4317' }],
  [{ host: '127.0.0.1:4317', origin: 'http://localhost:4317' }],
])('it passes the console its own Host, with no Origin or its own: %o', (headers) => {
  expect(checkConsoleRequest(buildRequest(headers), 4317)).toBe(true);
});

test.each([
  [{ host: 'kettle.example:4317' }],
  [{ host: 'kettle.example' }],
  [{ host: '127.0.0.1:4318' }],
  [{ host: '127.0.0.1' }],
  [{ host: 'localhost' }],
  [{ host: '127.0.0.1:4317.kettle.example' }],
  [{ host: '0.0.0.0:4317' }],
  [{ host: '[::1]:4317' }],
  [{ host: 'LOCALHOST:4317' }],
  [{ host: '' }],
  [{ host: '127.0.0.1:4317', origin: 'http://kettle.example' }],
  [{ host: '127.0.0.1:4317', origin: 'https://127.0.0.1:4317' }],
  [{ host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4318' }],
  [{ host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317.kettle.example' }],
  [{ host: '127.0.0.1:4317', origin: 'null' }],
  [{ host: '127.0.0.1:4317', origin: '' }],
])('it refuses a foreign Host or Origin: %o', (headers) => {
  expect(checkConsoleRequest(buildRequest(headers), 4317)).toBe(false);
});
