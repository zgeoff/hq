import type { RefObject } from 'react';
import type { ConsoleItem } from '../load-console-items.ts';
import { InlineCode } from './inline-code.tsx';
import { ItemDetails } from './item-details.tsx';

export interface ItemCardProps {
  item: ConsoleItem;
  note: string;
  busy: boolean;
  copied: boolean;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  onNote: (note: string) => void;
  onPick: (label: string) => void;
  onSendNote: () => void;
  onAskStu: () => void;
}

const KIND_LABELS: Record<ConsoleItem['kind'], string> = { call: 'Call', proposal: 'Proposal', todo: 'To do', review: 'Review' };

// One item in focus: the meta line, the question, its options, the note box with Ask Stu, then the
// details. A free-text item has no options; the owner answers it in the note.
export function ItemCard(props: ItemCardProps) {
  const item = props.item;
  return (
    <article className="hq-card" key={item.id}>
      <p className="hq-meta">
        <span>{KIND_LABELS[item.kind]}</span>
        <span className="hq-meta-id">{item.id}</span>
        {item.title !== item.question && <span className="hq-meta-title">{item.title}</span>}
        {item.deadline !== null && <span className="hq-meta-deadline">{item.deadline}</span>}
        {item.time !== null && <span>{item.time}</span>}
      </p>
      <h1 className="hq-question">
        <InlineCode text={item.question} />
      </h1>
      {item.options.length > 0 && (
        <div className="hq-options">
          {item.options.map((o, i) => (
            <button className="hq-option" type="button" key={o.label} data-pick={o.recommended === true} aria-keyshortcuts={o.noKey === true ? undefined : String(i + 1)} disabled={props.busy} onClick={() => props.onPick(o.label)}>
              <span className="hq-option-head">
                <span className="hq-option-label">{o.label}</span>
                {o.recommended === true && <span className="hq-pick">Stu's pick</span>}
              </span>
              {o.effect !== '' && (
                <span className="hq-effect">
                  <InlineCode text={o.effect} />
                </span>
              )}
              {i < 9 && o.noKey !== true && <kbd className="hq-kbd">{i + 1}</kbd>}
            </button>
          ))}
        </div>
      )}
      <NoteRow {...props} />
      <ItemDetails item={item} />
    </article>
  );
}

function NoteRow(props: ItemCardProps) {
  return (
    <div className="hq-note-row">
      <label htmlFor="hq-note" className="hq-sr">
        Note or your own answer
      </label>
      <textarea
        className="hq-note"
        id="hq-note"
        ref={props.noteRef}
        rows={1}
        value={props.note}
        disabled={props.busy}
        placeholder="Add a note, or your own answer + Enter    (i)"
        onChange={(e) => props.onNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            props.onSendNote();
          }
        }}
      />
      <button className="hq-stu" type="button" aria-keyshortcuts="y" onClick={props.onAskStu}>
        {props.copied ? 'Copied, paste to Stu' : 'Ask Stu'}
        {!props.copied && <kbd className="hq-kbd">y</kbd>}
      </button>
    </div>
  );
}
