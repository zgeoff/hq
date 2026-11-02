export interface Answer {
  source: 'ask' | 'review' | 'typed';
  id: string;
  kind: string;
  title: string | null;
  issues: string[];
  session: string | null;
  picked: string | null;
  stuPick: boolean | null;
  words: string | null;
  ref: string | null;
  via: string;
  at: string;
}

export interface AnswerWindow {
  from: string;
  to: string;
}

export interface PickedOption {
  picked: string | null;
  stuPick: boolean | null;
  words: string | null;
}

export interface AnswerWeek {
  from: string;
  to: string;
  partial: boolean;
  answered: number;
}
