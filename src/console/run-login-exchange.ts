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
  const answer = await page.post(`${page.origin}/auth/exchange`, JSON.stringify({ token }));
  const body: unknown = answer.ok ? await answer.json() : null;
  if (typeof body !== 'object' || body === null || !('session' in body) || typeof body.session !== 'string') {
    return 'refused';
  }
  page.storage.setItem(SESSION_STORAGE_KEY, body.session);
  return 'signed-in';
}
