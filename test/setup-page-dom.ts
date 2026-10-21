import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { onTestFinished } from 'bun:test';

// A page test's DOM at `url`, gone when the test ends, with Testing Library to drive it. Bun keeps
// its own fetch and microtasks: React DOM keeps the queueMicrotask it first loads with, and a closed
// happy-dom window's never fire, which would stall every page test after the first.
export async function setupPageDOM(url: string) {
  const kept = {
    fetch: globalThis.fetch,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    queueMicrotask: globalThis.queueMicrotask,
  };
  GlobalRegistrator.register({ url });
  Object.assign(globalThis, kept);
  return await loadTestingLibrary();
}

// Testing Library would register its own hooks from inside the test; its cleanup runs here, before
// the DOM goes, once React's last scheduled work is done.
async function loadTestingLibrary() {
  process.env['RTL_SKIP_AUTO_CLEANUP'] = 'true';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const library = await import('@testing-library/react');
  onTestFinished(library.cleanup);
  onTestFinished(async () => {
    await Bun.sleep(50);
    await GlobalRegistrator.unregister();
  });
  return library;
}
