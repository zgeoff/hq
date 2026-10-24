import { EXCHANGE_PATH, ExchangeReplySchema } from '../console-auth/login-exchange.ts';
import type { ExchangeRequest } from '../console-auth/login-exchange.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';

interface LoginPage {
  hash: string;
  origin: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  clearHash: () => void;
  post: (url: string, body: string) => Promise<Response>;
}

// A login link carries its one-time token after #t=, which the browser never sends to a server.
// The page swaps it for a session, keeps the session in this tab, and takes the token off the URL.
export async function runLoginExchange(page: LoginPage): Promise<'signed-in' | 'refused' | 'none'> {
  const token = page.hash.startsWith('#t=') ? page.hash.slice(3) : '';
  if (token === '') {
    return page.storage.getItem(SESSION_STORAGE_KEY) === null ? 'none' : 'signed-in';
  }
  page.clearHash();
  const request: ExchangeRequest = { token };
  const answer = await page.post(`${page.origin}${EXCHANGE_PATH}`, JSON.stringify(request));
  const body: unknown = answer.ok ? await answer.json() : null;
  const reply = ExchangeReplySchema.safeParse(body);
  if (!reply.success) {
    return 'refused';
  }
  page.storage.setItem(SESSION_STORAGE_KEY, reply.data.session);
  return 'signed-in';
}
