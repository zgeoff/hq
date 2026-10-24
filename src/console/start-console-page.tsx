import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import type { ConsoleAPI } from './console-api.ts';
import { ConsoleAPIContext } from './console-api-context.ts';
import type { createConsoleAppRouter } from './create-console-app-router.tsx';
import { runLoginExchange } from './run-login-exchange.ts';
import type { LoginOutcome, LoginPage } from './run-login-exchange.ts';
import { SignInNotice } from './sign-in-notice.tsx';

export interface ConsolePageDeps {
  login: LoginPage;
  router: ReturnType<typeof createConsoleAppRouter>;
  queryClient: QueryClient;
  api: ConsoleAPI;
  render: (view: ReactNode) => void;
}

// The console view only for a tab that holds a session; any other tab sees how to sign in.
export async function startConsolePage(deps: ConsolePageDeps): Promise<LoginOutcome> {
  const outcome = await runLoginExchange(deps.login);
  deps.render(
    <StrictMode>
      {outcome === 'signed-in' ? (
        <ConsoleAPIContext value={deps.api}>
          <QueryClientProvider client={deps.queryClient}>
            <RouterProvider router={deps.router} />
          </QueryClientProvider>
        </ConsoleAPIContext>
      ) : (
        <SignInNotice outcome={outcome} />
      )}
    </StrictMode>,
  );
  return outcome;
}
