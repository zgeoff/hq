export interface NewOutboxItem {
  target: string;
  text: string;
  topic: string | null;
}

export function buildMockNewOutboxItem(overrides: Partial<NewOutboxItem> = {}): NewOutboxItem {
  return { target: 'kettle-bot', text: 'Invented kettle note', topic: null, ...overrides };
}
