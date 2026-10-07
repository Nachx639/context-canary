# Context Canary 🐤

[Español](README.es.md) · MIT · **Tested with Claude Code 2.1.293**

Long coding conversations can stop following an instruction you gave earlier.
Context Canary makes one instruction visible: begin each final answer with a
small sentinel, `🐤` by default. A bird stays alive in its animated cage while
that instruction is followed. A missing sentinel is a warning signal, not proof
that context was lost; compaction does not guarantee the next answer will comply.

> **GIF placeholder:** a live cage → a missing sentinel → a death toast →
> compaction → “revived after compaction”. Add a recording here before publishing.

## Install

Once this repository has been published as `<owner>/context-canary`, replace
`<owner>` with the actual GitHub owner:

```sh
claude plugin marketplace add <owner>/context-canary
claude plugin install context-canary@context-canary
```

This checkout has no remote and has not been published. For a local installation:

```sh
claude plugin marketplace add /absolute/path/to/context-canary-repo
claude plugin install context-canary@context-canary
```

In a new interactive session, run `/canary setup`. It shows the exact rule and
asks for consent before updating `~/.claude/CLAUDE.md`. No file is changed on
plugin load. If the rule was added during an existing session, start a new one
so Claude Code reads it. Avoid enabling two copies of the canary simultaneously.

## Configuration

The manifest's `userConfig` fields appear in Claude Code's `/config` panel.
The host passes the resolved values to `register(on, options)`; this mod never
edits settings. Restart the session after changing options if it has not reloaded.

| Option | Default | Meaning |
| --- | --- | --- |
| `word` | `🐤` | Sentinel at the start of each final reply. One line, up to 64 Unicode code points. Invalid/empty input falls back to `🐤`. |
| `autoCompact` | `true` | Compact after death. `false` means notifications only. |
| `cooldownMinutes` | `30` | A second death **less than** this many minutes after successful automatic compaction locks recovery. Range 0–10080; `0` disables the window. |
| `language` | `en` | `en` or `es`. 2.1.293 exposes no UI locale accessor, so language is explicit. |
| `size` | `normal` | Pixel-art canary: `tiny` (10×3 cells), `small` (14×4), `normal` (20×6) or `large` (24×8). |
| `info` | `none` | Text beside the canary: `none` (only the bird), `status` (“Canary alive/dead”) or `details` (status, streak, death and recovery notes). |

After changing `word` or the rule's language, run `/canary setup` again to update
the managed rule. Matching ignores case and accents, allows bold, quotes,
Markdown punctuation and preceding emojis, and rejects longer lookalike words.
`✨ **CANÁRIO**: done` matches `canario`; `hello canario` and `canarios` do not.

The CLI can set a string option too:

```sh
claude plugin configure context-canary@context-canary --values-stdin <<'JSON'
{"word":"canario","language":"es"}
JSON
```

## Commands

| Command | Effect |
| --- | --- |
| `/canary` | Show the previous status, then revive and reset the counters. |
| `/canary status` | Show health, sentinel, counters and recovery note without changing state. |
| `/canary revive` | Revive/reset counters. Retains the cooldown timestamp and any recovery lock. |
| `/canary setup` | Confirm adding/updating the marked rule in the user's `CLAUDE.md`. |
| `/canary remove` | Confirm removing only that marked block. |

`/canario` is an alias. Subcommands also accept `estado`, `revivir`, `configurar`
and `quitar`; `init`, `reset` and `uninstall` are aliases for setup, revive and
remove. `remove`/`uninstall` here remove the instruction block, not the plugin.

The managed block uses `<!-- context-canary:start -->` and
`<!-- context-canary:end -->`. Setup is idempotent, preserves surrounding text
and line endings, and also recognizes the exact current rule outside a block.
It asks before replacing an older rule. Incomplete/duplicate markers, a read
error, cancellation or a file changed during the dialog prevent the write.
Remove does not delete unmarked instructions you wrote yourself.

## Recovery and display

Only a nonempty final `turn.complete.answer`, with `reason: 'answer'`, from an
interactive main turn is checked. Subagents, aborted turns, intermediate tool
steps, local command output and `claude -p` runs do not trigger it.

On death, the mod retains the first failing reply's number, timestamp and short
excerpt, shows a toast and queues a timer. After the turn returns, it calls
`$.session.compact` with instructions to preserve all user instructions,
constraints, preferences, decisions and unfinished work, including the sentinel
rule. A newly started turn postpones the call. Compaction may use a model request
and incur normal Claude Code usage.

Successful automatic compaction revives the bird with **“revived after
compaction”**. A skipped or rejected call leaves it dead and explains why, with
no retries. A real main-session `classic.PostCompact` can also revive a dead
bird after manual/host compaction; the plugin's own result controls its automatic
attempt, so the two paths cannot revive twice.

A second death within the configured window leaves **“this session cannot
recover: start a new one”**. This lock lasts until `/clear` or a new session.
Manual revival is available but does not remove the lock or cooldown. If
compaction is in flight, revival reports its status and waits for the result.
`/clear`, session shutdown and manual revival cancel queued work; an old result
cannot revive a different context.

The band shows **only the canary in its cage**, drawn as pixel art: in the
terminal a `Raster` of half blocks (two pixels per cell), in Desktop a crisp
`Svg` of the same pixels. It blinks, chirps and hops with at most one redraw
per second; the dead bird lies belly-up, grey and still. There is no audio.
Details stay in the shadows: toasts on death and recovery, and `/canary status`
for streak and history. Set `info` to `status` or `details` to put them beside the cage. When the
sprite does not fit (from `tiny` 10 columns × 3 rows to `large` 24 × 8), the
display falls back to one line. Surveys and subagent views retain the host's display.

Health/history and cooldown live in host `$.state`, surviving module reloads,
but not process restarts. Claude Code resets that state on `/clear`, `/resume`
and `/branch`. A reload during recovery leaves the bird dead with an interrupted
note rather than replaying a possibly completed operation. No background file,
network or process calls are made by the mod; only explicit setup/remove uses
the file API. The host's compaction is the operation that can call a model.

## Develop and test

```sh
claude plugin validate .
claude plugin validate ./.claude-plugin/plugin.json
claude plugin test .
claude plugin validate ./plugins/context-canary
claude plugin test ./plugins/context-canary
```

`claude plugin test` is a mod runner, not a marketplace runner. The root
`.claude-plugin/plugin.json` and `hooks/hooks.json` are a **development test
entry** that loads the same nested module. They let the root command execute
the shipped tests without a second implementation. The marketplace installs
only `./plugins/context-canary/`. Keep root `userConfig` defaults in sync with
the nested manifest when editing them.

Tests use `claude-code/testing`, a fake clock, in-memory state, filesystem stubs
and an `AskUserQuestion` stub for `$.ui.ask`. They cover recovery, exact cooldown
boundaries, skip/rejection, deferred work and stale results, matching, both
languages, consent/idempotence, ignored turns, state migration/reload, narrow
layouts and the terminal/Desktop render trees. No setup is run on the developer's
actual instruction file. A compaction rejection is simulated with a failing
event stub; the kit skips it and the underlying test host rejects the call.

The workflow uses Anthropic's [official native installer](https://code.claude.com/docs/en/setup#install-a-specific-version),
pinned to **2.1.293**, and runs validation/tests at both levels. No model API key
is needed for stubbed tests. The workflow has not been run on GitHub; neither
real model compaction nor actual terminal/Desktop pixels have been exercised
by the test suite. A local test tree is not a screenshot test.

Local generated API types are excluded from Git. Where those 2.1.293 types and
TypeScript already exist, additionally run:

```sh
tsc -p plugins/context-canary/.claude-plugin/types/tsconfig.json --allowJs --checkJs
```

References: [manifest/userConfig](https://code.claude.com/docs/en/plugins-reference#user-configuration),
[mods API](https://code.claude.com/docs/en/plugins/mods/api),
[test kit](https://code.claude.com/docs/en/plugins/mods/test),
[marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
For this implementation, the locally generated **2.1.293** API types take
precedence over a newer or older website.

## Layout

```text
.claude-plugin/marketplace.json     Public marketplace
.claude-plugin/plugin.json          Root development test entry
hooks/hooks.json                    Loads the shipped module for root tests
plugins/context-canary/
  .claude-plugin/plugin.json        Plugin manifest, 1.1.0 and userConfig
  hooks/{hooks.json,register.js,i18n.js,pixels.js}
  hooks/sprites.js                 Generated from design/sprites.json

  types/index.d.ts                 Host state contract
  tests/canary.test.ts
.github/workflows/test.yml
design/                             Pixel-art source, preview.html, render.py
scripts/build-sprites.mjs           design/sprites.json → hooks/sprites.js
README.md · README.es.md · CHANGELOG.md · LICENSE
```

The marketplace owner is the neutral `Context Canary contributors`. Set the
actual owner and replace `<owner>` in the installation example when publishing;
no GitHub username or remote repository is assumed here.
