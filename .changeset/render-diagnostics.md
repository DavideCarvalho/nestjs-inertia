---
"@dudousxd/nestjs-inertia": minor
---

Emit per-render diagnostics on a `node:diagnostics_channel` (`nestjs-inertia:render`)
for tooling such as nestjs-telescope's Inertia panel: rendered component, resolved
props (passed by reference for downstream redaction), the partial-reload decision,
deferred/optional/once/merge/excluded keys, asset version + version-mismatch, history
flags, status code and payload size. Zero-cost when nothing is subscribed; gated by a
`diagnostics` module option. No new runtime dependency (`node:diagnostics_channel` is
core). Also routes non-attributable flat class-validator messages to the form-level
error bucket instead of inventing a phantom field key.
