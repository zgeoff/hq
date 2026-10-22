interface FakeMessageOutcome {
  status: 'queued' | 'delivered' | 'answered' | 'unanswered';
  answer?: string;
  answeredAt?: number;
}

interface FakeAtcCall {
  method: string;
  input: unknown;
}

export interface FakeAtcState {
  // session.kill, session.update, session.forget and session.spawn, in order
  calls: FakeAtcCall[];

  // message.get outcomes by message id, over a delivered record of the sent message
  messages: Map<string, FakeMessageOutcome>;

  // session.get prompt by session id
  prompts: Map<string, string>;

  // session ids whose session.get answers this many more times, then fails
  getBudgets: Map<string, number>;

  // session ids whose forget atc refuses as pinned
  forgetRefusals: Set<string>;

  // session ids whose forget answers with a confirmToken
  forgetTokens: Set<string>;

  // message ids whose message.get atc fails
  messageFailures: Set<string>;

  // session ids whose pin atc refuses
  pinFailures: Set<string>;
}

export function buildFakeAtcState(): FakeAtcState {
  return { calls: [], messages: new Map(), prompts: new Map(), getBudgets: new Map(), forgetRefusals: new Set(), forgetTokens: new Set(), messageFailures: new Set(), pinFailures: new Set() };
}
