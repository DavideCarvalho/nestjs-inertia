---
'@dudousxd/nestjs-inertia-vite': patch
---

Fix: externalize express, body-parser, and Node built-ins from bundle to prevent "Dynamic require of path is not supported" crash on Node 26.
