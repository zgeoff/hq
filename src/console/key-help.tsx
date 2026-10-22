import { TAB_KEY_LIST } from './tab-key-list.ts';

interface KeyHelpProps {
  open: boolean;
  onToggle: () => void;

  // The current tab's own keys; the keys every tab shares follow them.
  keys: readonly { key: string; what: string }[];
}

// The key list `?` opens, and the small button that opens it.
export function KeyHelp(props: KeyHelpProps) {
  if (!props.open) {
    return (
      <button className="hq-help-toggle" type="button" onClick={props.onToggle}>
        <kbd className="hq-kbd">?</kbd> keys
      </button>
    );
  }
  return (
    <div className="hq-help" role="dialog" aria-label="Keyboard shortcuts">
      {[...props.keys, ...TAB_KEY_LIST].map((k) => (
        <div className="hq-help-row" key={k.key}>
          <span>{k.what}</span>
          <kbd className="hq-kbd">{k.key}</kbd>
        </div>
      ))}
    </div>
  );
}
