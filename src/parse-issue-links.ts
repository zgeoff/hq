const RELATIONS = ['Fixes', 'Contributes to', 'Related to'] as const;
const LINK_PATTERN = /\b(?<keyword>fixes|contributes to|related to):?\s+(?<id>[A-Z][A-Z0-9]*-\d+)\b/giu;

export type IssueRelation = (typeof RELATIONS)[number];

export interface IssueLink {
  relation: IssueRelation;
  keyword: string;
  id: string;
}

export function parseIssueLinks(body: string): IssueLink[] {
  const links = [...body.matchAll(LINK_PATTERN)].flatMap((match) => {
    const keyword = match.groups?.['keyword'] ?? '';
    const relation = RELATIONS.find((candidate) => candidate.toLowerCase() === keyword.toLowerCase());
    const id = match.groups?.['id'];
    return relation === undefined || id === undefined ? [] : [{ relation, keyword, id }];
  });
  return links.toSorted((first, second) => RELATIONS.indexOf(first.relation) - RELATIONS.indexOf(second.relation));
}
