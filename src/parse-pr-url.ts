export interface PRRef {
  owner: string;
  repo: string;
  number: number;
}

export function parsePRURL(url: string): PRRef | null {
  const m = /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)\/?$/u.exec(url);
  if (!m?.groups) {
    return null;
  }
  return { owner: m.groups['owner'] ?? '', repo: m.groups['repo'] ?? '', number: Number(m.groups['number']) };
}
