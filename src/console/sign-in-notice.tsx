interface SignInNoticeProps {
  refused: boolean;
}

// The page's only view until the tab holds a console session.
export function SignInNotice(props: SignInNoticeProps) {
  return (
    <main className="sign-in">
      <h1>Sign in to hq console</h1>
      {props.refused ? <p>That login link is used or unknown.</p> : null}
      <p>
        Open the login link on the terminal where <code>hq console</code> runs. For a new one, run <code>hq console login</code>: it prints there.
      </p>
    </main>
  );
}
