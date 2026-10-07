# Changelog

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
