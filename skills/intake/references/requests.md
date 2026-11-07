# Requests

Draft and file a bug or request through a subagent, from step 2 of intake's
[Bugs and requests](../SKILL.md#bugs-and-requests).

1. Spawn the subagent. It:
   - loads the [tickets](../../tickets/SKILL.md) skill;
   - searches GEO for duplicates and related issues;
   - reads the code, recent PRs and running sessions;
   - reproduces the bug if that is cheap and read-only.

   It returns only a draft in the tickets skill's sections, the evidence, any duplicate or related
   issue, and up to two questions.

2. Put its questions to the owner, and fit the draft to the answers. For a duplicate of GEO-n,
   comment the new evidence there. Otherwise file it in GEO's Triage, related to each issue the
   subagent found.
