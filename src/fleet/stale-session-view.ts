export interface StaleSessionView {
  id: string;
  name: string;
  state: string | undefined;
  lastActivityAt: number;
}
