export type DotState = 'done' | 'current' | 'waiting';

interface ProgressDotsProps {
  dots: DotState[];
  label: string;
}

// One dot per item this visit: the answered ones grey, the one in focus long and dark.
export function ProgressDots(props: ProgressDotsProps) {
  return (
    <div className="hq-dots">
      {props.dots.map((state, i) => (
        <span className="hq-dot" aria-hidden="true" data-state={state} key={`${i}:${state}`} />
      ))}
      <span className="hq-progress">{props.label}</span>
    </div>
  );
}
