# Follow-ups

A follow-up is a Linear issue for a finding a PR leaves unfixed. Only you file them, when the agent
answers with its reason, so you can check the reason against the diff and the issue. A hook refuses
`save_issue` until this file is loaded.

## A reason that fails

Judge the agent's reason by `fix-it-here`. When it fails, reply in the finding's thread (step 3's
command) with its file and line, in 1 to 3 sentences, telling the agent to fix it here. Leave the
thread open.

## File the follow-up

1. Take the issue's sections from the agent's answer: Outcome, Context (file, line, evidence), Scope
   and Acceptance, in its words. If one is missing, ask in the thread and wait.
2. `save_issue` in team GEO, state Triage, titled from the Outcome. The description starts
   `From <repo>#<pr number>` (repo without `zgeoff/`), then the four sections.
3. Reply in the thread, with the first comment's id from
   `gh api repos/zgeoff/<repo>/pulls/<pr number>/comments --paginate`:

   ```bash
   gh api repos/zgeoff/<repo>/pulls/<pr number>/comments/<the thread's first comment id>/replies -f body='deferred GEO-<issue number>'
   ```

4. `hq followup add GEO-<issue number> --from <repo>#<pr number>`. hq alerts `z-triage` about any
   issue that names a PR without this record.
5. For reason 2, message `z-triage` the issue ID and the choice, to queue as a call.
