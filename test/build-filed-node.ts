export interface FiledNode {
  identifier: string;
  title: string;
  createdAt: string;
  description: string | null;
  creator: { app: boolean } | null;
  labels: { nodes: { name: string }[] };
  attachments: { nodes: { url: string }[] };
}

export function buildFiledNode(identifier: string, description: string | null, overrides: Partial<FiledNode> = {}): FiledNode {
  return { identifier, title: 'Invented kettle work', createdAt: '2026-10-16T01:00:00Z', description, creator: { app: false }, labels: { nodes: [] }, attachments: { nodes: [] }, ...overrides };
}
