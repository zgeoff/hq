import type { Fetcher } from './types.ts';

const FETCH_MS = 10_000;

// ok means HTTP 200 and nothing else; a redirect is not a healthy answer.
export const realFetcher: Fetcher = async (url) => {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'hq-probe' }, signal: AbortSignal.timeout(FETCH_MS) });
    await res.body?.cancel();
    return { ok: res.status === 200, status: res.status, ms: Date.now() - t0, ...(res.status === 200 ? {} : { error: `HTTP ${res.status}` }) };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - t0, error: String((e as Error).message ?? e).slice(0, 160) };
  }
};
