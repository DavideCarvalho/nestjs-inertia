---
"@dudousxd/nestjs-inertia": patch
---

perf: avoid redundant prop-tree work per render — identity fast-path in `unpackDotKeys` when no dot-keys are present, `nullifyUndefined` returns existing references when no `undefined` is found (no full deep clone), and header splits are guarded behind presence to avoid array allocation on the common path.
