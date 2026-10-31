# Investigation brief

The launch prompt for an issue that asks questions, not for a code change. Fill each angle-bracket
placeholder from the issue and the [delivery brief](brief.md); the rest goes to the agent word for
word. Leave no placeholder in, and drop the imp line off an imp. Name a findings file the owner will
look at, such as `docs/spikes/<topic>.md`.

```text
Find out <the issue's questions, in one line> for <issue ID>, to inform <the decision the issue's Outcome names>.

<Paste the issue's Outcome, Context, Questions to answer and Acceptance sections as written, and leave out a section it lacks.>

<The delivery brief's Permissions block, filled in as for a delivery: the Code delivery grant, for the PR that holds the answers.>

Finish line: findings with evidence and a recommendation, written to <path> in <repo> in a PR marked ready for review, and a final report that sums them up and links the PR. List a follow-up only when it belongs in another repo or needs my decision. <The delivery brief's sentence that keeps my name out and asks for invented examples.>

<The delivery brief's imp line, when you launch the agent on an imp, a cloud machine with its own checkout.>

<The delivery brief's paragraph on scratch files and cleanup.>
```
