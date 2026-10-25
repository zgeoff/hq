import { setupServer } from 'msw/node';
import { anthropicHandlers } from './anthropic-handlers.ts';
import { linearHandlers } from './linear-handlers.ts';

// hq's one MSW server; test/msw-preload.ts starts it, resets it after each test and closes it.
export const server = setupServer(...linearHandlers, ...anthropicHandlers);
