# wrapping up

How `agent-delegation` wraps up a session.

When the agent's PR is ready or its report is in:

- Leave the session running until the PR merges, so the agent can answer review findings.
- After the issue's last PR merges, and after acceptance when an agent runs it, unpin a delivery session and forget it with `atc_session_forget` and `stop: true`. Forget each session it spawned too, since a forgotten parent leaves its children running. Use `atc_session_stop` instead only when the owner wants the session kept.
- A pin means the session needs the owner, as [pins.md](pins.md) says. Never unpin a session in order to forget it: forget a pinned session only once it no longer needs him. While he talks with it, or it holds a report or decisions for him, keep it pinned and running, and ask `z-stu` before you wrap it up.
- Before you destroy an imp, check it for unpushed work. When that check can't reach the imp, such as an SSH timeout, say so where the owner will see it, to `z-stu` or in the run's note, before the destroy, with the evidence you rely on instead, such as the merged final head.
- A design or audit session whose report holds decisions for the owner isn't finished at its report. Keep it alive and pinned until he has worked through the decisions in it.
- When a design or audit session is finished, and its decisions and follow-up issues are filed in Linear, unpin it and forget it with `atc_session_forget` and `stop: true`. Linear holds the record.
- At a delivery agent's FINAL note: For each item the final report leaves unfixed, check its reason. Reason 1 holds only when the file it names is in another repo. Reason 2 holds only when the report names the choice the issue doesn't settle. A doc change that only records behaviour the issue or a linked decision already settles never holds it: send it back to the agent for this PR. A missing permission or a narrow brief holds neither reason: give the permission when your grants cover it, or ask the owner, and send the item back for this PR. When a reason holds, file the item in Triage with `From <repo>#<n>` and send its number to `z-review`. For reason 2, send the choice to `z-triage` by message, so its check puts it to the owner. When a reason doesn't hold, send the item back to the agent to fix in this PR, before the review starts. File nothing else.
