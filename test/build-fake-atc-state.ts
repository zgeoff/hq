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
  calls: FakeAtcCall[];

  messages: Map<string, FakeMessageOutcome>;

  prompts: Map<string, string>;

  getBudgets: Map<string, number>;

  forgetRefusals: Set<string>;

  forgetTokens: Set<string>;

  messageFailures: Set<string>;

  pinFailures: Set<string>;
}

export function buildFakeAtcState(): FakeAtcState {
  return { calls: [], messages: new Map(), prompts: new Map(), getBudgets: new Map(), forgetRefusals: new Set(), forgetTokens: new Set(), messageFailures: new Set(), pinFailures: new Set() };
}
