# Changelog

## 1.3.1 — 2026-10-09

Found by a real session with `target: project` and two deaths:

- `/canary log` wrote an outcome to the newest entry, even when it belonged to another session; it now goes to
  this session's own death.
- The death notice is one line: Claude Code 2.1.295 drew the newline inside a turn annotation as `�`.
- A death still waiting for compaction reads "compaction pending", and the summary no longer says "1 deaths".

## 1.3.0 — 2026-10-09

- `target` (`global` or `project`): `/canary setup` and `/canary remove` can edit the project's `CLAUDE.md`.
- Checkpoints are read back from both instruction files at session start, so every session and project checks
  the words Claude was given; a lost one from the project file says so.
- `/canary log` (`historial`, `history`): the last 30 deaths across sessions with project, reply, outcome and
  missing checkpoints.
- Chinese README.

## 1.2.0 — 2026-10-07

- `checkpoints` (0–5): `/canary setup` spreads code words through `CLAUDE.md` and puts the rule last; every
  answer must carry them, so the canary samples the whole file and a death names the checkpoint that was lost.
- `/canary remove` also removes the checkpoints; a second setup with the same count changes nothing.

## 1.1.0 — 2026-10-07

- Pixel-art canary and cage: half-block `Raster` in the terminal, `Svg` in Desktop, same pixels.
- Blink, chirp and hop frames at most once per second; a grey belly-up dead bird that stays still.
- Only the canary in the band by default; `info` (`none`, `status`, `details`) adds text beside the cage.
- New `size` option: `tiny` (10×3 cells), `small` (14×4), `normal` (20×6) or `large` (24×8), each drawn by hand; one-line fallback when it does not fit.
- Art source in `design/` (sprites, preview, renderer) and `scripts/build-sprites.mjs`.

## 1.0.0 — 2026-10-07

- Publishable `context-canary` marketplace layout and MIT license.
- Configurable sentinel, automatic compaction, recovery window and English/Spanish UI.
- Death notifications and deferred compaction preserving user instructions; revive only on success.
- A repeated death within 30 minutes locks automatic recovery until a new context; skipped/failed compaction stays dead.
- Consent-based, idempotent `/canary setup` and `/canary remove` using managed instruction markers.
- `/canary`, `status`, `revive` and Spanish aliases; manual revival retains loop protection.
- Preserve the animated cage, first-death history, Unicode matching, other mods' output and host state.
- Desktop-compatible elements and a one-line fallback for narrow/short viewports.
- Exclude subagents, aborted/non-answer turns and non-interactive sessions.
- Regression tests with `claude-code/testing`, pinned CI and a marketplace root test entry.

## Earlier local mod

Derived from the local `canario` 0.2.0 mod. Its existing marketplace identity can
remain installed with a customized manifest; no personal sentinel is hardcoded
in the shared implementation.
