// What the quiet-point check reads of a session: atc's state, and its last activity in ms.
export interface StaleSessionView {
  id: string;
  name: string;
  state: string | undefined;
  lastActivityAt: number;
}
