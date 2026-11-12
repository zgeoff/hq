export function toStateRole(sessionName: string): string {
  return sessionName.startsWith('z-') ? sessionName.slice('z-'.length) : sessionName;
}
