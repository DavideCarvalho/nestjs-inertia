---
'@dudousxd/nestjs-inertia': patch
---

Move `@dudousxd/nestjs-diagnostics` from `^0.2.0` to `^0.7.2`.

The 0.2.x line declares `@nestjs/core` / `@nestjs/common` peers of `^10 || ^11`, so an app on
NestJS 12 got a peer warning through this package even though `@dudousxd/nestjs-inertia` itself
already allows `>=10.0.0`. 0.7.2 declares `^10 || ^11 || ^12`. The two functions this package
uses, `emit` and `getChannel`, are unchanged between the two lines.
