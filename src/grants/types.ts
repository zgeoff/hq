export interface GrantAction {
  id: number;
  grant_name: string;
  target: string;
  note: string | null;
  actor: string;
  at: string;
}

export interface GrantActionInput {
  grant: string;
  target: string;
  note: string | null;
  actor: string;
}

// One named grant and the actions taken under it in a window, none included.
export interface GrantTally {
  grant: string;
  mark: number;
  text: string;
  ref: string | null;
  actions: GrantAction[];
}

export interface GrantMarkInput {
  text: string;
  ref: string | null;
  at: string | null;
  name: string;
  actor: string;
}

export interface GrantNaming {
  id: number;
  name: string;
  actor: string;
}

export interface GrantWindow {
  from: string;
  to: string;
}
