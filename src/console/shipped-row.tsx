import type { ReportPR } from '../shipped/types.ts';

interface ShippedRowProps {
  markers: string[];

  // The issue id, or a no-issue PR's repo, before the title.
  label: string;
  title: string;
  url: string;
  pill: string | null;
  prs: ReportPR[];
}

// One row in two lines: the markers, the title and the state pill, then the PR chips under the
// title. The marker column has a fixed width, so every row's title and chips start at one x.
export function ShippedRow(props: ShippedRowProps) {
  return (
    <li className="hq-shipped-row">
      <span className="hq-shipped-markers" aria-hidden={props.markers.length === 0 ? true : undefined}>
        {props.markers.join(' ')}
      </span>
      <a className="hq-shipped-title" href={props.url} target="_blank" rel="noreferrer" title={`${props.label} ${props.title}`}>
        <span className="hq-shipped-label">{props.label}</span> {props.title}
      </a>
      {props.pill === null ? <span /> : <span className="hq-shipped-pill">{props.pill}</span>}
      <ul className="hq-shipped-chips" aria-label="Pull requests">
        {props.prs.map((pr) => (
          <li key={pr.url}>
            <a className="hq-shipped-chip" href={pr.url} target="_blank" rel="noreferrer">
              {pr.repo}#{pr.number}
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}
