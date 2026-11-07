# Check vers on production

vers is the owner's web game, on `https://versidle.com`. It has no previews, so you check it only
after the release, under the vers-qa grant in your start prompt. When `z-review` sends a vers check
before the release, tell it that vers checks run after the release. Write only through QA accounts,
never as a real player.

- `bun run qa:reset` with `--all` deletes the account. Never run it on `qa-geo-1926`.
- `bun run qa:seed` refuses a level above 1 without `--runs`, and your grant doesn't cover
  `--runs`. Mark an item that needs a higher level as needing the owner.

1. **Use vers's [QA runbook](https://github.com/zgeoff/vers/blob/main/docs/runbooks/qa.md)** for
   every tool. Run the tools in your clone of zgeoff/vers at `~/.local/share/z-sessions/vers`,
   outside the scratch folder, and pull `main` there before each check. Your private file says where the credentials and the
   database are.
2. **Pick the account:**
   - Use `qa-geo-1926`, the owner's permanent phone account, for an item that needs the owner's
     phone, and for any item on GEO-1926. Its sign-in is in the vers vault. Never seed it, and
     never delete it.
   - Use `qa-geo-<n>` for any other item, where `<n>` is the issue's number.
3. **Reserve the account:** write `account=<the account>` in the check's line in `qa.md`. If another
   line in `qa.md` names the account, wait until that check removes its line.
4. **Seed a `qa-geo-<n>` account** with `bun run qa:seed --user qa-geo-<n> --level 1 --yes`. Skip
   this step for `qa-geo-1926`: the account exists. When the seed refuses because the account
   exists, an earlier check left it. Delete it with
   `bun run qa:reset --user qa-geo-<n> --all --yes`, and seed again.
5. **Drive a phone item yourself,** through the phone's Chrome, on the DevTools port `z-stu` gives
   you. Send `z-stu` only the hands-on steps, such as signing in or switching airplane mode, one at
   a time, and wait for each. `z-stu` passes each to the owner.
6. **Go offline only while `qa:cdp offline` runs:** the phone is back online when it ends. An item
   that needs the phone offline for longer needs the owner, unless the runbook can keep it offline.
7. **Reset the account when you finish,** pass or fail, and set `account=-` in the check's
   line. After a phone item, reset only once the owner's last step is done and you have read what
   you need.
   - Reset `qa-geo-1926` with `bun run qa:reset --user qa-geo-1926 --yes`, which keeps the account.
   - Reset a `qa-geo-<n>` account with `bun run qa:reset --user qa-geo-<n> --all --yes`, which
     deletes it.

Never record any of these, in evidence, scratch or a message:

- the seeded password;
- the phone account's sign-in;
- a two-factor secret;
- an inbox code or link.

After a seed, delete any file that holds the password.
