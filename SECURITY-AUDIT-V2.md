# Security Audit V2 — `nestjs-inertia` post-v1-remediation

**Scope:** monorepo at `/home/dudousxd/personal/nestjs-inertia/` HEAD `e6c445e`. Read-only second-pass audit. Verifies the 14 findings in `SECURITY-AUDIT.md` (v1) hold, and looks for new surface introduced since v0.7.0-alpha.0 (auto-bootstrap codegen, `<Link>` components, SSR `data:` URL trick, `@ApplyContract({ validate: true })`, `forFeature` isolation, multi-app, Vite 6, etc.).

`pnpm audit --prod` is clean.

---

## Verification of v1 findings

| ID  | Status | Where verified |
|-----|--------|----------------|
| **C-1** XSS via unescaped `</script>` | FIXED | `packages/core/src/shell/serialize-page.ts:14-32` introduces `serializePageData` replacing `<`,`>`,`&`,U+2028,U+2029. Used in `shell.ts:10`, `file-shell.renderer.ts:44`, `directives.ts:28` (via `ctx.pageJson` only — directives never re-stringify). Verified all three sinks call it (`grep -n JSON.stringify packages/core/src/shell` returns 0 raw stringify of page data). |
| **H-1** `@ApplyContract` no runtime validation | FIXED with opt-in caveat | `apply-contract.decorator.ts:39-56` adds `validate?: boolean`. When `true`, `ContractValidationPipe` (`contract-validation.pipe.ts:23-52`) calls `safeParse` and throws `BadRequestException`. Default remains `false` (backward-compat). See **N-1** for residual concern about the default. |
| **H-2** Vulnerable transitive deps | FIXED | `packages/core/package.json` pins `"fastify": "^5.8.5"` (devDep). `examples/*` pin `"vite": "^6.4.2"`. `website/package.json` pins `"astro": "^6.1.10"`. `pnpm audit --prod` → "No known vulnerabilities found." |
| **H-3** CSRF not bound to session/user | PARTIALLY FIXED | `csrf-token.ts:18-30` adds dot-count strictness; `csrf-cookie.interceptor.ts:38-51` exports `rotateCsrfToken` with `secure: process.env.NODE_ENV === 'production'` default. **Token is still NOT bound to a session or user identifier** — see **N-2**. |
| **H-4** Probe `fork()` w/ unvalidated path | FIXED | `load-config.ts:48-57,68-69` introduces `assertInsideCwd` for `app.moduleEntry`. `TSX_TSCONFIG_PATH` is resolved against cwd via `resolveAbsolute`. See **N-3** for residual `tsconfig` not being jailed. |
| **M-1** Prototype pollution in `setNested` | FIXED | `set-nested.ts:3-10` blocks `__proto__` / `prototype` / `constructor` via `assertSafeKey` on every walk step. Both intermediate and final-segment writes are checked. |
| **M-2** Auth-guard path-prefix bypass | FIXED | `auth.guard.ts:27-37` calls `new URL(raw, 'http://localhost').pathname` which decodes and normalises before allow-list match. The `signInUrl` open-redirect concern (M-2 sub-issue 3) is **not** addressed — see **N-4**. |
| **M-3** `originalUrl` echoed in 409 Location | NOT FIXED | `service.ts:233` still does `this.res.status(409).setHeader('X-Inertia-Location', this.req.originalUrl).end();` with no validation. See **W-1**. |
| **M-4** `loadManifest` no shape validation | NOT FIXED | `asset/version.provider.ts:17-25` still casts `JSON.parse(raw) as Manifest` without validating `file`/`css` shape. See **W-2**. |
| **M-5** Method-spoofing default-enabled | NOT FIXED | `method-spoof.middleware.ts:14` still treats `undefined` as "enabled" — only `=== false` disables. Same for `fastify-method-spoof.middleware.ts:13`. See **W-3**. |
| **M-6** `@inertia` directive unescaped JSON | FIXED (folded into C-1) | `directives.ts:28` interpolates `ctx.pageJson` which is the already-escaped string from `serializePageData`. |
| **L-1** `timingSafeEqual` length mismatch | FIXED | `csrf-token.ts:13-15` checks `byteLength` before call; `verifyCsrfToken` rejects tokens with !== 1 dot (`csrf-token.ts:21-26`). |
| **L-2** `flashStore.read()` errors swallowed | NOT FIXED | `service.ts:240-247` still has bare `} catch {}`. See **I-1**. |
| **L-3** `pages.d.ts` single-quote interpolation | NOT FIXED | `emit-pages.ts:10` still does `` `'${p.name}'` ``. See **I-2**. |
| **L-4** Prod-skip backstop `NESTJS_INERTIA_CODEGEN_PROBE` | UNCHANGED (acceptable) | `module.ts:429-433` still gates only on `NODE_ENV` and the probe env. Acceptable trade-off; see **I-3**. |
| **L-5** `ApiHttpError.body` enumerable | NOT FIXED | `fetcher/errors.ts:1-9` still `public readonly body`. See **I-4**. |
| **L-6** `buildUrl` un-encoded path params | FIXED | `url-builder.ts:22` `encodeURIComponent(String(val))`. Emit also fixed: `emit-routes.ts:86`. |
| **L-7** Raw `!==` cookie/header compare | FIXED | `csrf.guard.ts:37` uses `timingSafeEqualSafe`. |

Net: **C-1 closed**, **H-1/H-2/H-4 closed**, **H-3 partial**, **M-1/M-2/M-6 closed**, **M-3/M-4/M-5 still open**, L-fix coverage ~50%.

---

## NEW findings

### CRITICAL

_(none)_

### HIGH

#### N-1 — `@ApplyContract` validation defaults to **off**; silent insecure-by-default

**Files:** `packages/client/src/contract/apply-contract.decorator.ts:39-44,52-54`

The runtime-validation pipe is now implemented (good), but `opts.validate` defaults to `false`. The README pattern users copy (`@ApplyContract(Contract.post(...))`) still produces a controller whose body is **not** validated. The class-level docstring even says "Default: `false` — schemas are read at codegen-time only" — meaning the H-1 footgun described in v1 still exists *by default*.

**Attack scenario.** Same as v1 H-1: developer writes `@ApplyContract(Contract.post('/users', { body: z.object({name: z.string()}) }))`, omits `{ validate: true }`, ships mass-assignment vulnerability. Code review of the controller looks correct because the Zod schema is right there.

**Recommended fix.** Flip the default to `validate: true` in a major version bump (the typing changed in v0.9 already; one more breaking change is reasonable). Or: emit a `Logger.warn` on first invocation of a contract-decorated handler in non-prod mode when `validate !== true`. Current default is "secure by exception," which inverts the principle.

#### N-2 — CSRF token still not bound to session / user; `rotateCsrfToken` does not invalidate prior issuance

**Files:** `packages/core/src/csrf/csrf-token.ts:3-7`, `csrf-cookie.interceptor.ts:38-51,74-77`

v1 H-3 was partly closed (rotation API + secure defaults), but the underlying HMAC payload is still `HMAC(secret, raw)`. Calling `rotateCsrfToken(res)` writes a fresh `Set-Cookie`, but the **previous** token a victim might still hold remains HMAC-valid forever (server-side has no way to reject it — it carries no nonce, no session ID, no jti, no issue-time, and there is no server-side issued-token store).

Attack chain unchanged from v1: (1) XSS or any leak yields a valid token, (2) victim logs out → server calls `rotateCsrfToken`, (3) attacker replays the *old* token from off-site → guard verifies HMAC, passes. The `rotate` API is cosmetic against this scenario.

Independent issue: `CsrfCookieInterceptor.intercept` (`csrf-cookie.interceptor.ts:70-78`) only rotates when the cookie is missing OR HMAC-invalid. If a handler calls `rotateCsrfToken(res)` mid-request, the interceptor has already (or will) write its own cookie; whichever `Set-Cookie` runs last wins. With two `cookie()` calls in one response there is no defined order — Express appends, the **client** sees two `Set-Cookie` lines (per RFC 6265 §5.4 a client takes the **last** matching one, but proxies may strip duplicates). This is a footgun: in some deployments the rotate is a no-op.

**Recommended fix.**
1. Bind: `HMAC(secret, raw + '|' + sessionIdOrIp + '|' + issuedAtBucket)`. Read `sessionId` via a pluggable resolver; users without sessions can fall back to a fingerprint.
2. Optional server-side issued-token cache with short TTL; reject HMAC-valid tokens whose `jti` is not in the cache (or has been explicitly invalidated by `rotateCsrfToken`).
3. In `rotateCsrfToken`, also clear the cookie via `res.clearCookie` before re-issuing, to force a clean replacement and surface accidental double-write to logs.

#### N-3 — `app.tsconfig` is NOT jailed; codegen probe spawn accepts arbitrary tsconfig path

**File:** `packages/codegen/src/config/load-config.ts:73`

`assertInsideCwd` is applied to `app.moduleEntry` (closes H-4) but **not** to `app.tsconfig`. `discoverRoutes` passes `tsconfig` directly into `execArgv: ['--import', tsxEsmPath]` + `env.TSX_TSCONFIG_PATH = tsconfigPath` (`routes.ts:53,61`). A malicious `nestjs-inertia.config.ts` (or any postinstall-modified config) can set `app.tsconfig: '/etc/passwd'` (causes spurious tsx error) or, more cleverly, `app.tsconfig: 'node_modules/evil/tsconfig.json'` whose `paths` mapping redirects module resolution to attacker-controlled JS.

**Attack scenario.** Malicious npm dep with postinstall edits `nestjs-inertia.config.ts` to point `app.tsconfig` at its own tsconfig that aliases `@nestjs/core` → its own shim. On next codegen probe, the developer's `AppModule` boots through the attacker's `@nestjs/core`. Equivalent severity to v1 H-4.

**Recommended fix.** Add `assertInsideCwd(cwd, resolvedTsconfig, 'app.tsconfig')` after line 73. Reject `tsconfig` paths under `node_modules/` unless explicitly opted in.

### MEDIUM

#### N-4 — `signInUrl` not validated; open-redirect risk via `return_to`

**File:** `packages/core/src/guard/auth.guard.ts:111-114, 117-118`

The guard normalises the **incoming** path (M-2 fix), but the **outgoing** target is `${this.options.signInUrl}?return_to=${encodeURIComponent(path)}`. If `signInUrl` is user-influenced (via config layered from env in some setups), it could be `//evil.com` (protocol-relative) or `https://evil.com/login`. Setting `X-Inertia-Location` to this value causes the SPA client to navigate to evil.com **with the user's session cookies**.

Even if `signInUrl` is static, `encodeURIComponent(path)` is applied to the *normalised* path — but `path` always starts with `/`, so the URL ends up like `/login?return_to=%2Fadmin`. Acceptable. The risk is purely `signInUrl` itself.

**Recommended fix.** In `InertiaAuthGuard` constructor, validate `options.signInUrl.startsWith('/')` and not `'//'`. Throw `InvalidInertiaConfigException` otherwise.

#### N-5 — `featureToken()` uses `Symbol.for(...)` (global registry) — scope leakage across worker isolates

**File:** `packages/core/src/tokens.ts:11-16`

`featureToken('OPTIONS', 'tenant-a')` returns `Symbol.for('INERTIA_FEATURE_OPTIONS:tenant-a')`. The `Symbol.for` registry is **process-global**. In multi-tenant deployments using `worker_threads` to host two Nest apps with overlapping scope names, both apps share the same symbol — but each has its own DI container, so this happens to work *because* the symbol resolves to different providers per container.

The real risk: two `forFeature({ scope: 'admin' })` calls in **different feature modules of the same app** both register a provider under `Symbol.for('INERTIA_FEATURE_OPTIONS:admin')`. NestJS DI will pick one (last-registered wins, generally), silently. There is no duplicate-scope detection. A late-loaded module can shadow an earlier `forFeature` provider, e.g. an injected test module overriding production scope.

**Attack scenario.** A library author publishes a Nest module that internally calls `InertiaModule.forFeature({ scope: 'admin' })`. A consumer who also uses scope `admin` for their tenant routing now has their admin-scope options silently overridden by the library — including `flashStore`, `share` (which can leak user info across tenants).

**Recommended fix.** Either (a) use `Symbol('...')` (per-call unique) — but that requires a registry to look up by scope-string; or (b) track scope registrations in a module-static `Set<string>` and throw on duplicate; or (c) document loudly that scope names live in a global namespace and recommend prefixing.

#### N-6 — Codegen `auto-bootstrap` swallows ALL errors silently (denial-of-service detection blind spot)

**File:** `packages/core/src/module.ts:426-467`

`_startCodegenWatcher` catches every error class with a single `logger.warn`. The chain is: lazy-import → loadConfig → watch. If `watch()` throws *after* registering chokidar listeners (e.g. fork/spawn fails mid-init), file descriptors may leak. If `loadConfig` succeeds but the config has a malicious `pages.glob` like `/**/*` (no relative root), `chokidar.watch(join(cwd, glob))` will watch the entire FS. This is a DoS vector available to any postinstalled package that can write to `nestjs-inertia.config.ts`.

Additionally: in `module.ts:443-447` the lazy-import error is silently swallowed (`catch {}`), which means a deliberately broken codegen package (e.g. supply-chain compromise) prevents the watcher from running but leaves no audit trail.

**Recommended fix.**
1. Validate `pages.glob` is a relative path and is not `/**/*` or similar wide pattern. Reject patterns starting with `/` or `**`.
2. Log all `_startCodegenWatcher` failures at `error` (not `warn`), with the stack — `logger.warn` is too quiet for a path that can fail security-relevantly.
3. Add a kill-switch env var: `NESTJS_INERTIA_NO_AUTOBOOT=1` that, when set, skips the watcher unconditionally — needed for security-conscious deployments.

#### N-7 — `emit-api.ts` interpolates contract `name` + `path` into TS source without escaping

**File:** `packages/codegen/src/emit/emit-api.ts:42, 64-79`; also `emit-routes.ts:24-26`

Discovered route metadata (`r.name`, `r.path`, `c.contractSource.{query,body,response}`) is interpolated raw into generated `.ts` files. The static AST discovery path can produce `name = "foo'); evil(); //"`, which becomes `'foo'); evil(); //'` in the emitted file. The contract `name` derives from `varDecl.getName()` (a TS identifier so it's safe) — **but** `c.path` derives from `pathArg.getLiteralValue()` (`contracts-fast.ts:224`), a string literal whose content the developer (or any code-gen step) chose freely. The probe path (`probe.ts:124,132`) reads `PATH_METADATA` which is again a developer-supplied string.

The blast radius: codegen runs the watcher in **dev** mode automatically. Generated files in `.nestjs-inertia/` are then imported by user code at startup. A `@Controller("')); console.log(process.env); //")` would produce a `routes.ts` containing live code execution at the *consumer* build stage.

**Attack scenario.** Supply-chain: a library exposes a `@Controller("malicious-template")` whose path string contains a closing quote and arbitrary TS. The consumer adds the controller, runs `pnpm dev`, codegen writes `routes.ts` with embedded TS that fires when the consumer's bundle compiles. Exfil at build-time on the developer machine.

**Recommended fix.** Use `JSON.stringify(r.name)` and `JSON.stringify(r.path)` in `emit-routes.ts:24,26` and `emit-api.ts:42,64-79`. Same for contract identifiers in `emit-api.ts`. Apply universally — any user-derived string written into emitted `.ts` MUST be JSON-stringified, not template-interpolated.

### LOW / INFO

#### I-1 — `flashStore.read()` errors silently swallowed (re-flag from v1 L-2)

`service.ts:244` empty catch. Misconfigured flash stores fail invisibly. Log at `warn`.

#### I-2 — `emit-pages.ts:10` single-quote escape bug (re-flag from v1 L-3)

`needsQuotes(p.name) ? `'${p.name}'` : p.name` — use `JSON.stringify(p.name)` to handle apostrophes in filenames. Defense-in-depth.

#### I-3 — Prod-skip relies on env vars only (re-flag from v1 L-4)

`module.ts:429-433` still trusts `NODE_ENV`. Misconfigured Docker images with `NODE_ENV=development` in prod start the watcher and lazy-import codegen + chokidar + tsx in prod, plus open file descriptors to source files. Severity: low, but consider also gating on `process.env.npm_lifecycle_event` matching dev scripts.

#### I-4 — `ApiHttpError.body` enumerable (re-flag from v1 L-5)

`fetcher/errors.ts:6` `public readonly body` — error reporters auto-serialise. Mark non-enumerable via `Object.defineProperty(this, 'body', { value: body, enumerable: false, writable: false })`.

#### I-5 — No CSP / nonce-injection helper (re-flag from v1 I-4)

Library still ships zero CSP guidance and no nonce helper for the inline `<script id="inertia-page">`. Document recommended CSP. Without CSP, the now-fixed C-1 has no defence-in-depth.

#### I-6 — Watcher lock file is TOCTOU-racy

**File:** `packages/codegen/src/watch/lock-file.ts:33-46`

Two processes can both `readFile` → see "stale lock" → both `writeFile` → both think they hold the lock. Use `O_EXCL` (`{ flag: 'wx' }`) on the writeFile call to atomically claim the lock. Dev-only impact, low severity.

#### I-7 — Vite middleware-mode dev server: arbitrary `configFile` (re-flag from v1 I-1)

`vite/setup.ts:23` and `plugin/plugin.ts` resolve user paths against cwd. Vite 6 upgrade is clean. No new exposure detected in middleware-mode beyond what was flagged in v1.

#### I-8 — `discoverRoutes` probe has 10s timeout; no upper bound on `routes` returned

`routes.ts:34, 56-83` — a malicious moduleEntry could send a huge `routes` payload via IPC; received in `m.routes ?? []`. No size cap. Low concern (dev-only) but consider truncating to e.g. 10000 entries.

#### I-9 — `InertiaTestingModule.forTest` accepts arbitrary `InertiaModuleOptions`

**File:** `packages/testing/src/testing-module.ts:8-12`

The testing helper forwards `...options` into `InertiaModule.forRoot` unchanged. A test could pass `codegen: { enabled: true }` and trigger the auto-bootstrap inside a test container. Not a production bypass (testing module is not on the prod path), but documenting that `forTest` does **not** disable codegen auto-boot would help.

**Recommended fix.** Default `codegen: { enabled: false }` in `forTest` to prevent test runs from accidentally spinning up the codegen watcher.

#### I-10 — Hand-committed `examples/*/.nestjs-inertia/` artifacts

Generated outputs are now committed (per commit `e6f3b85`). Reviewed `examples/express-react/.nestjs-inertia/{routes.ts,pages.d.ts,index.d.ts,components.json}` — no secrets, paths, or env values leaked. `components.json` includes mtime timestamps (informational only). Safe. One caveat: if a future contributor regenerates with a different `propsExport` setting and forgets to commit, the committed artifacts can drift from `inertia/pages/*.tsx` — but that's a maintenance issue, not a security one.

---

## WARNINGS (re-classified from v1, unfixed)

#### W-1 — `service.ts:233` echoes raw `originalUrl` in `X-Inertia-Location` header (v1 M-3 unfixed)

Version-mismatch path: client sends `X-Inertia-Version: stale`, server replies `409 X-Inertia-Location: <raw originalUrl>`. The Inertia SPA navigates to that location. Open-redirect chain still live. The fix is unchanged from v1: normalise originalUrl via `new URL(originalUrl, 'http://localhost').pathname + search` and reject if not pathname-only.

#### W-2 — `loadManifest` no shape validation (v1 M-4 unfixed)

A malformed/poisoned manifest still passes through unchecked. Add a minimal Zod (or hand-rolled) schema check: each entry must have `file: string` not starting with `//`, not containing `://`.

#### W-3 — `methodSpoofing` default-enabled (v1 M-5 unfixed)

`method-spoof.middleware.ts:14` and `fastify-method-spoof.middleware.ts:13` both treat `undefined` as enabled. Flip the default to disabled; users wanting Laravel-style HTML form spoofing opt in explicitly.

---

## Explicitly clean (re-verified)

- **`<Link>` components (React / Vue / Svelte).** `routes-stub.ts:28-40` calls a user-provided resolver; the codegen-emitted `route()` (`emit-routes.ts:74-90`) uses `encodeURIComponent` on path params. React's `link.tsx`, Vue's `link.ts`, and Svelte's `Link.svelte` pass `href` through @inertiajs framework `<Link>` which escapes attributes. No XSS via route name or params identified. Query params are passed as objects to `buildUrl`, which uses `URLSearchParams` (line 26) — also encoded.
- **SSR loader `data:` URL trick.** `ssr-loader.service.ts:24-39` reads the bundle file from `bundlePath` (configured by developer) and base64-encodes into a `data:` URL. The data URL content **is** the bundle code — same trust model as `import(bundlePath)` directly. No new attack surface; if `bundlePath` is attacker-controlled the original config layer was already compromised. The data-URL detour does not widen exposure.
- **ts-morph static AST discovery.** `contracts-fast.ts:24-67` is read-only AST traversal; no `eval`, no dynamic require. Globbed files are added with `addSourceFileAtPath` (parser only). Even if a malicious controller file is in the glob, ts-morph won't execute it. Safe.
- **`@ApplyContract({ validate: true })` ZodError leakage.** `contract-validation.pipe.ts:46-50` serialises `parsed.error.issues` into a `BadRequestException` body. Zod issues do not include user-PII by default, but **do** include the rejected `path` and `message`. For deeply-nested schemas this can echo internal field names back. Documented behaviour; acceptable for an opt-in pipe. No fix needed.
- **CSRF `rotateCsrfToken` race / double-issue.** Within a single request, the cookie interceptor runs *before* the handler. If the handler calls `rotateCsrfToken`, only the last `Set-Cookie` for the same name is meaningful to the client. Verified `csrf-cookie.interceptor.ts:74-77` only writes when cookie is absent or invalid — so a valid existing cookie + handler rotation produces exactly one `Set-Cookie` (the handler's). Not racy; see N-2 for the orthogonal session-binding concern.
- **Multi-app `forFeature` token isolation.** Per-scope tokens are derived via `Symbol.for(...)` (`tokens.ts:15`). Within one Nest container, providers are bound by exact symbol; isolation works. Cross-app sharing via `Symbol.for` global registry is theoretical (different containers, different providers), but see **N-5** for the same-process duplicate-scope issue.
- **`InertiaTestingModule` bypassing production guards.** `testing-module.ts` is a thin pass-through to `InertiaModule.forRoot`; it cannot disable CSRF or auth guards (those are user-installed). No production bypass mechanism present. Minor concern flagged in I-9.
- **Vite 6 upgrade fallout.** Middleware-mode behaves as before; no new endpoints exposed. `setup.ts:21-31` continues to gate dev server creation on `mode !== 'production'`.
- **Fastify adapter request parity.** `adapter/fastify.ts` and `adapter/express.ts` are symmetrical for header reads (lowercased lookups), body, query, and status setting. No header-injection vector identified — `setHeader`/`header()` calls go through Node's HTTP stack which rejects CRLF.
- **`Reflect.getMetadata` reads of contract objects (probe.ts).** Probe reads metadata into descriptors, but only emits `zodToTs(contract.body|query|response)` output as TS type strings; never serialises arbitrary contract object properties. Functions/secrets attached to a contract object would NOT survive `zodToTs` (returns `'unknown'`). Safe.
- **Asset-version sha1.** `version.provider.ts:29` still `sha1` over `JSON.stringify(manifest)` — cache-busting only, no security claim. Fine.
- **`suppressPostSendWrites`.** `helpers/suppress-post-send-writes.ts` patches Express `res` methods to no-op after `headersSent`; no injection vectors. Safe.
- **Trivy + Grype CI.** `.github/workflows/security.yml` (commit `84d8472`) runs weekly Trivy + Grype with SARIF upload to GitHub Security tab. Severity cutoff scoped (commit `e6f3b85` clamps to high+). Good operational posture.

---

## Net improvement since v1

The v1 ship-blocker (C-1 XSS) is fully closed across all three render paths via the centralised `serializePageData` helper. Three of four HIGH findings are closed; the fourth (H-3 CSRF) is partly closed via API surface but the underlying binding model still lacks a session identifier (N-2). All MEDIUM findings in the dependency tree are resolved (`pnpm audit --prod` clean). The introduction of `assertInsideCwd` jail (H-4) is well-implemented but incomplete — `app.tsconfig` slipped through (N-3) and warrants a follow-up. The codegen auto-bootstrap (`module.ts:378-410`) is a new ~80-line attack surface that traded one risk (manual CLI vs no codegen) for another (silent watcher in any dev with `NODE_ENV != production`); N-6 is the right place to invest next. Newly-shipped `@ApplyContract({ validate: true })` is a clean implementation but its **default-off** behavior (N-1) preserves the original v1 H-1 footgun for the unaware reader. Code-emission paths (N-7) accept user-controlled strings without quoting — a regression vector that did not exist when codegen had no `routes.ts`/`api.ts` outputs.

Overall posture: **substantially improved** for runtime (XSS, prototype pollution, dep CVEs, URL encoding); **marginally improved** for CSRF (rotation API without binding); **regressed** for codegen attack surface (new file-emission injection vectors). Recommend addressing N-1, N-2, N-3, N-7 before any 1.0 release.

---

_Audit performed read-only against HEAD `e6c445e`. No source files were modified. `pnpm audit --prod` snapshot: 0 known vulnerabilities._
