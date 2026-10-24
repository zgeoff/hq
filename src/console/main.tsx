import { QueryClient } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createConsoleAppRouter } from './create-console-app-router.tsx';
import { restoreTheme } from './restore-theme.ts';
import { startConsolePage } from './start-console-page.tsx';

const root = document.querySelector('#root');

restoreTheme(document.documentElement, () => globalThis.localStorage);

if (root !== null) {
  await startConsolePage({
    render: (view) => createRoot(root).render(view),
    router: createConsoleAppRouter(),
    queryClient: new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } }),
    login: {
      hash: globalThis.location.hash,
      origin: globalThis.location.origin,
      storage: () => globalThis.sessionStorage,
      clearHash: () => globalThis.history.replaceState(null, '', globalThis.location.pathname),
      post: (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    },
  });
}
