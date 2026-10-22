import { afterAll, afterEach, beforeAll } from 'bun:test';
import { linearDocuments, linearIssues, linearWorkflowStates } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';

beforeAll(() => {
  server.listen({
    // the console and atc suites call servers they start on loopback ports
    onUnhandledRequest: (request, print) => {
      if (['127.0.0.1', '[::1]', 'localhost'].includes(new URL(request.url).hostname)) {
        return;
      }
      print.error();
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  linearIssues.length = 0;
  linearDocuments.length = 0;
  linearWorkflowStates.length = 0;
});

afterAll(() => {
  server.close();
});
