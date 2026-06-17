---
'@dudousxd/nestjs-inertia': minor
---

Emit render diagnostics on the standard `aviary:inertia:render` channel via
`@dudousxd/nestjs-diagnostics` (`emit('inertia', 'render', payload)`), instead of
the bespoke `nestjs-inertia:render` channel. The diagnostic payload shape
(`InertiaRenderDiagnostic`, `v: 1`) is unchanged — it now travels inside the
standard envelope (`{ ts, lib, event, traceId?, payload }`), with `traceId`
auto-filled from the optional `@dudousxd/nestjs-context` accessor when present.
The render path stays zero-cost when no watcher subscribes.

Any subscriber should now subscribe to `aviary:inertia:render` and read
`envelope.payload`. The generic `@dudousxd/nestjs-diagnostics-telescope` watcher
captures these automatically.

BREAKING (pre-2.0 of this line): the `INERTIA_DIAG_CHANNEL` constant is removed
(the channel name is now derived via `@dudousxd/nestjs-diagnostics`'
`channelName('inertia', 'render')`). The dedicated
`@dudousxd/nestjs-telescope-inertia-watcher` package is retired in favor of the
generic diagnostics watcher.
