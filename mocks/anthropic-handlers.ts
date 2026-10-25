import { HttpResponse, http } from 'msw';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

// Anthropic's messages API: a token it holds usage for gets a message and that account's rate-limit
// headers, and any other token the API's 401.
export const anthropicHandlers = [http.post(ANTHROPIC_MESSAGES_URL, (info) => readMessagesAnswer(info))];

interface SlotWindowRecord {
  // A fraction of 1, as the utilization header carries it.
  utilization: number;

  // Epoch seconds, as the reset header carries it.
  reset: number;
}

export interface SlotUsageRecord {
  five?: SlotWindowRecord;
  seven?: SlotWindowRecord;
}

// The usage of each setup token's account, by the request's authorization header; test/msw-preload.ts
// empties it after each test.
export const slotUsage = new Map<string, SlotUsageRecord>();

interface MessagesRequest {
  request: Request;
}

function readMessagesAnswer(info: MessagesRequest): Response {
  const usage = slotUsage.get(info.request.headers.get('authorization') ?? '');
  if (usage === undefined) {
    return HttpResponse.json({ type: 'error', error: { type: 'authentication_error', message: 'Invalid bearer token' } }, { status: 401 });
  }
  return HttpResponse.json(
    { id: 'msg_invented0001', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'Hi' }], stop_reason: 'max_tokens', stop_sequence: null, usage: { input_tokens: 8, output_tokens: 1 } },
    { headers: { ...buildWindowHeaders('5h', usage.five), ...buildWindowHeaders('7d', usage.seven) } },
  );
}

function buildWindowHeaders(window: '5h' | '7d', record: SlotWindowRecord | undefined): Record<string, string> {
  if (record === undefined) {
    return {};
  }
  return { [`anthropic-ratelimit-unified-${window}-utilization`]: String(record.utilization), [`anthropic-ratelimit-unified-${window}-reset`]: String(record.reset) };
}
