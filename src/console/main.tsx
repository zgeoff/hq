import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createConsoleAppRouter } from './create-console-app-router.tsx';
import { restoreTheme } from './restore-theme.ts';
import { runLoginExchange } from './run-login-exchange.ts';
import { SignInNotice } from './sign-in-notice.tsx';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } }),
  root = document.querySelector('#root'),
  router = createConsoleAppRouter();

restoreTheme(document.documentElement, () => globalThis.localStorage);

const signedIn = await runLoginExchange({
  hash: globalThis.location.hash,
  origin: globalThis.location.origin,
  storage: globalThis.sessionStorage,
  clearHash: () => globalThis.history.replaceState(null, '', globalThis.location.pathname),
  post: (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
});

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      {signedIn === 'signed-in' ? (
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      ) : (
        <SignInNotice refused={signedIn === 'refused'} />
      )}
    </StrictMode>,
  );
}
