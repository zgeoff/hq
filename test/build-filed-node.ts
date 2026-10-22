export interface FiledNode {
  identifier: string;
  title: string;
  createdAt: string;
  description: string | null;
  creator: { app: boolean } | null;
  labels: { nodes: { name: string }[] };
  attachments: { nodes: { url: string }[] };
}

// An issue as Linear answers the filed-issues query: created at 12:00 Sydney on Fri 16 Oct by a
// person, with no labels and no attachments unless the overrides say so.
export function buildFiledNode(identifier: string, description: string | null, overrides: Partial<FiledNode> = {}): FiledNode {
  return { identifier, title: 'Invented kettle work', createdAt: '2026-10-16T01:00:00Z', description, creator: { app: false }, labels: { nodes: [] }, attachments: { nodes: [] }, ...overrides };
}
