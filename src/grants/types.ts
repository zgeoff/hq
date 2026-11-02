export interface GrantAction {
  id: number;
  grant_name: string;
  target: string;
  note: string | null;
  actor: string;
  at: string;
}

export interface GrantActionRow extends GrantAction {
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface VoidedGrantAction {
  id: number;
  target: string;
  note: string | null;
  actor: string;
  at: string;
  voidedAt: string;
  voidedBy: string;
  voidReason: string;
}

export interface GrantActionInput {
  grant: string;
  target: string;
  note: string | null;
  actor: string;
}

export interface GrantTally {
  grant: string;
  mark: number;
  text: string;
  ref: string | null;
  actions: GrantAction[];
  voided: VoidedGrantAction[];
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

export interface GrantVoidArgs {
  id: number;
  reason: string;
}

export type GrantVoidCaller = { kind: 'session'; id: string } | { kind: 'unknown'; cause: string };

export type GrantActState = 'live' | 'void';

export type GrantActMove = 'grant-void';
