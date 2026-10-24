import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { createConsoleAppRouter } from './create-console-app-router.tsx';
import { runLoginExchange } from './run-login-exchange.ts';
import type { LoginOutcome, LoginPage } from './run-login-exchange.ts';
import { SignInNotice } from './sign-in-notice.tsx';

export interface ConsolePageDeps {
  root: Element;
  login: LoginPage;
  router: ReturnType<typeof createConsoleAppRouter>;
  queryClient: QueryClient;
}

// The console view only for a tab that holds a session; any other tab sees how to sign in.
export async function startConsolePage(deps: ConsolePageDeps): Promise<{ outcome: LoginOutcome; unmount: () => void }> {
  const outcome = await runLoginExchange(deps.login);
  const root = createRoot(deps.root);
  root.render(
    <StrictMode>
      {outcome === 'signed-in' ? (
        <QueryClientProvider client={deps.queryClient}>
          <RouterProvider router={deps.router} />
        </QueryClientProvider>
      ) : (
        <SignInNotice outcome={outcome} />
      )}
    </StrictMode>,
  );
  return { outcome, unmount: () => root.unmount() };
}
