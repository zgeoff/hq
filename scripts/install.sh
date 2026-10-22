#!/bin/sh
# Build hq into ~/.local/bin. When the lanes watcher is installed or running, `hq lanes start`
# rewrites its user unit, enables it and restarts it: it keeps the old code otherwise.
# HQ_INSTALL_OUT builds to another path and leaves the lanes watcher alone, for tests.
set -e
out=${HQ_INSTALL_OUT:-$HOME/.local/bin/hq}

# The commit the binary is built from, for `hq version`; dirty when the tree differs from it.
set --
if commit=$(git rev-parse --verify -q HEAD 2>/dev/null); then
  dirty=false
  [ -z "$(git status --porcelain 2>/dev/null)" ] || dirty=true
  set -- --define "globalThis.HQ_BUILD={\"commit\":\"$commit\",\"dirty\":$dirty}"
fi

# No .env or bunfig.toml from the working directory: hq-lanes runs in ~, and ~/.env is shell, not
# dotenv (its GITHUB_TOKEN line read as text made every gh call 401 on 2026-10-17).
bun build src/cli.ts --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig "$@" --outfile "$out"
if [ -n "${HQ_INSTALL_OUT:-}" ]; then
  exit 0
fi
if command -v systemctl >/dev/null 2>&1 && { systemctl --user is-enabled --quiet hq-lanes 2>/dev/null || systemctl --user is-active --quiet hq-lanes; }; then
  ~/.local/bin/hq lanes start
  echo "hq-lanes restarted on $(~/.local/bin/hq --version)"
fi
