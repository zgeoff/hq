import type { RouterHistory } from '@tanstack/react-router';
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { NeedsYouView } from './needs-you-view.tsx';
import { ShippedView } from './shipped-view.tsx';

// The console's pages by path; the page uses the browser's history, a test a memory one.
export function createConsoleAppRouter(history?: RouterHistory) {
  const rootRoute = createRootRoute();
  return createRouter({
    routeTree: rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/', component: NeedsYouView }), createRoute({ getParentRoute: () => rootRoute, path: '/shipped', component: ShippedView })]),
    ...(history === undefined ? {} : { history }),
  });
}
