import type { LoginOutcome } from './run-login-exchange.ts';

interface SignInNoticeProps {
  outcome: Exclude<LoginOutcome, 'signed-in'>;
}

const WHY: Record<SignInNoticeProps['outcome'], string | null> = {
  none: null,
  refused: 'That login link is used or unknown.',
  failed: 'The login could not finish: the console did not answer, or this browser blocks the page from keeping its session.',
};

// The page's only view until the tab holds a console session.
export function SignInNotice(props: SignInNoticeProps) {
  const why = WHY[props.outcome];
  return (
    <main className="sign-in">
      <h1>Sign in to hq console</h1>
      {why === null ? null : <p>{why}</p>}
      <p>
        Open the login link on the terminal where <code>hq console</code> runs. For a new one, run <code>hq console login</code>: it prints there.
      </p>
    </main>
  );
}
