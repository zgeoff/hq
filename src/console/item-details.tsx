import type { ConsoleItem } from '../load-console-items.ts';
import { InlineCode } from './inline-code.tsx';

interface ItemDetailsProps {
  item: ConsoleItem;
}

// The details, open and quiet, below the actions: Stu's view, the item's sections, the diff, what
// it unblocks and its links.
export function ItemDetails(props: ItemDetailsProps) {
  const item = props.item;
  return (
    <section aria-label="Details" className="hq-details">
      {item.stuView !== null && <Row head="Stu's view" text={item.stuView} />}
      {item.details.map((d, i) => (
        <div className="hq-row" key={`${i}:${d.heading}`}>
          <span className="hq-row-head">{d.heading}</span>
          <div className="hq-row-body">
            <span className="hq-row-text">
              <InlineCode text={d.text} />
            </span>
            {d.code !== undefined && (
              <pre className="hq-pre">
                <code>{d.code}</code>
              </pre>
            )}
          </div>
        </div>
      ))}
      {item.diff !== null && (
        <div className="hq-row">
          <span className="hq-row-head">Change</span>
          <div className="hq-diff">
            <span className="hq-diff-now">
              <InlineCode text={item.diff.now} />
            </span>
            <span className="hq-diff-would">
              <InlineCode text={item.diff.would} />
            </span>
          </div>
        </div>
      )}
      {item.unblocks.length > 0 && (
        <div className="hq-row">
          <span className="hq-row-head">Unblocks</span>
          <span className="hq-row-body">
            {item.unblocks.map((u) => (
              <span key={u.id}>
                <span className="hq-unblock-id">{u.id}</span>
                {u.title}
              </span>
            ))}
          </span>
        </div>
      )}
      {item.links.length > 0 && (
        <div className="hq-row">
          <span className="hq-row-head">Links</span>
          <span className="hq-links">
            {item.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </span>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  head: string;
  text: string;
}

function Row(props: RowProps) {
  return (
    <div className="hq-row">
      <span className="hq-row-head">{props.head}</span>
      <span className="hq-row-text">
        <InlineCode text={props.text} />
      </span>
    </div>
  );
}
