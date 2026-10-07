# Context Canary 1.2.0

A pixel-art context canary for Claude Code **2.1.293**. MIT licensed.

Use `/config` to choose `word` (default `🐤`), `language` (`en` default, or `es`),
`autoCompact` (default on), `cooldownMinutes` (default 30), `size` (`tiny`, `small` default,
`normal`, `large`) and `info` (`none` default: only the bird; `status`; `details`).

- `/canary setup`: asks before adding/updating the marked canary rule in your
  `~/.claude/CLAUDE.md`. Restart the session to read newly added instructions.
- `/canary`: status, then revival. `/canary status`: read-only status.
- `/canary revive`: reset health/counters; keep recovery loop protection.
- `/canary remove`: asks before removing only the managed rule.
- `/canario` is an alias, with `estado`, `revivir`, `configurar`, `quitar` aliases.

A missing sentinel in a final main interactive reply kills the bird. It toasts,
then compacts after the turn, asking to preserve user instructions. Success
revives; skip/failure stays dead. A repeated death within the window locks
recovery until `/clear` or a new session. Set `autoCompact` off for alerts only.
This is a heuristic, not proof of lost context or a guarantee of recovery.

No audio. Subagents, aborted turns and non-interactive runs are ignored. The terminal
draws a half-block `Raster`, Desktop an `Svg` of the same pixels, with a one-line layout
when the sprite does not fit.
The tests check render trees and stubbed compaction, not real app pixels or a
live model. State survives module reloads, not process restarts.

```sh
claude plugin validate .
claude plugin test .
```

The repository's English and Spanish READMEs contain installation, behavior and
CI details. No external service or remote repository is required by this plugin.
