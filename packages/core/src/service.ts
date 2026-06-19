import { Logger } from '@nestjs/common';
import type { InertiaRequest, InertiaResponse } from './adapter/adapter.js';
import type { Manifest } from './asset/version.provider.js';
import { buildDiagnostic } from './diagnostics-builder.js';
import {
  type InertiaRenderDiagnostic,
  inertiaRenderChannel,
  publishInertiaRender,
} from './diagnostics.js';
import type { FlashData, FlashStore } from './flash/flash-store.js';
import { nullifyUndefined } from './helpers/nullify-undefined.js';
import { unpackDotKeys } from './helpers/set-nested.js';
import { validateLocationUrl } from './helpers/validate-location-url.js';
import { type Marker, getMarkerKind, getMarkerMeta, getMarkerValue, isMarker } from './markers.js';
import type { ShellParts } from './shell/shell.js';
import type { PageObject, Props, SharedInput, ShellRenderCtx, SsrStreamResult } from './types.js';
import type { InertiaPages } from './types/registry.js';

/** Sentinel to indicate a prop should be omitted from the output. */
const OMIT = Symbol('inertia.omit');

/**
 * Shared empty key list, returned when a partial-reload header is absent.
 * These lists are read-only at the use sites (only `.includes`), so a single
 * shared instance is safe and avoids per-request array allocation.
 */
const EMPTY_KEYS: string[] = [];

/** Returns true if the value contains any `always()` markers at any nesting depth. */
function containsAlwaysMarker(value: unknown): boolean {
  if (isMarker(value)) {
    return getMarkerKind(value as Marker) === 'always';
  }
  if (Array.isArray(value)) {
    return value.some(containsAlwaysMarker);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).some(containsAlwaysMarker);
  }
  return false;
}

/**
 * Immutable per-(top-level-key) context threaded through the nested marker
 * resolver. `topKey`/`subKeep` scope the walk to one top-level prop; `isFullReload`
 * and `resetOnceKeys` let a nested once() honor the same contract as a top-level
 * once() (resolve on a full reload or an explicit Reset-Once, omit on partials).
 */
interface NestedResolveContext {
  /** Top-level prop key — used to build full dot-paths (deferredProps / Reset-Once). */
  topKey: string;
  /**
   * Relative sub-path keep list (null = include all non-optional markers).
   * e.g. if top-level keep=["user.avatar"], subKeep=["avatar"] for the "user" object.
   */
  subKeep: string[] | null;
  /** True when this is a full reload (no X-Inertia-Partial-Data). */
  isFullReload: boolean;
  /** Full dot-paths the client asked to re-send via X-Inertia-Reset-Once. */
  resetOnceKeys: string[];
  /** Mutable deferred-props sink (group → full dot-paths). */
  deferredProps: Record<string, string[]>;
}

/**
 * Recursively resolve a nested plain object, walking all keys and resolving markers
 * at any depth with the same semantics as the top-level resolver.
 */
async function resolveNestedObjectValue(
  obj: Record<string, unknown>,
  ctx: NestedResolveContext,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const resolved = await resolveNestedValueInner(v, k, ctx);
    if (resolved !== OMIT) out[k] = resolved;
  }
  return out;
}

/**
 * Inner recursive resolver. Works on arbitrary values (markers, objects, arrays, scalars).
 *
 * @param value   Value to resolve
 * @param relPath Path relative to ctx.topKey (e.g. "profile.avatar" for user.profile.avatar)
 * @param ctx     Per-top-level-key resolution context
 */
async function resolveNestedValueInner(
  value: unknown,
  relPath: string,
  ctx: NestedResolveContext,
): Promise<unknown | typeof OMIT> {
  if (isMarker(value)) {
    return resolveMarker(value as Marker, relPath, ctx);
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const resolved = await resolveNestedValueInner(item, relPath, ctx);
      if (resolved !== OMIT) out.push(resolved);
    }
    return out;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const childPath = `${relPath}.${k}`;
      const resolved = await resolveNestedValueInner(v, childPath, ctx);
      if (resolved !== OMIT) out[k] = resolved;
    }
    return out;
  }

  // Scalar value: apply sub-path filter if active
  if (ctx.subKeep !== null) {
    // Include scalars only if their relPath is explicitly listed OR is a prefix of a listed path
    const included = ctx.subKeep.some((k) => k === relPath || k.startsWith(`${relPath}.`));
    if (!included) return OMIT;
  }

  return value;
}

async function resolveMarker(
  marker: Marker,
  relPath: string,
  ctx: NestedResolveContext,
): Promise<unknown | typeof OMIT> {
  const kind = getMarkerKind(marker);
  // Full dot-path (as it would appear in X-Inertia-Partial-Data / -Reset-Once)
  const fullPath = `${ctx.topKey}.${relPath}`;

  if (kind === 'always') {
    return getMarkerValue(marker)();
  }

  if (kind === 'optional') {
    // subKeep === null: full reload — omit optional
    // subKeep !== null: partial reload — include only if relPath is listed
    if (ctx.subKeep?.includes(relPath)) {
      return getMarkerValue(marker)();
    }
    return OMIT;
  }

  if (kind === 'once') {
    // Mirror the top-level once() contract: resolve on a full reload, or when the
    // client explicitly re-sends it via X-Inertia-Reset-Once (keyed by full
    // dot-path, like nested partial-data). On a partial reload it is omitted —
    // even if its parent is requested — because it was already delivered.
    if (ctx.isFullReload || ctx.resetOnceKeys.includes(fullPath)) {
      return getMarkerValue(marker)();
    }
    return OMIT;
  }

  if (kind === 'defer') {
    if (ctx.subKeep !== null) {
      // Partial reload: resolve only if listed
      if (ctx.subKeep.includes(relPath)) return getMarkerValue(marker)();
      return OMIT;
    }
    // Full reload: register as deferred using full dot-path
    const meta = getMarkerMeta(marker) as { group: string };
    const group = meta.group;
    const existing = ctx.deferredProps[group];
    if (existing) existing.push(fullPath);
    else ctx.deferredProps[group] = [fullPath];
    return OMIT;
  }

  if (kind === 'merge') {
    // merge() at nested level: resolve the value. Merge METADATA (mergeProps /
    // matchOn) addresses top-level prop keys only — the X-Inertia merge headers
    // can't reference a nested path — so nested merge carries no metadata, by design.
    if (ctx.subKeep !== null && !ctx.subKeep.includes(relPath)) return OMIT;
    return getMarkerValue(marker)();
  }

  return OMIT;
}

export interface SsrModule {
  render(page: PageObject): Promise<{ head: string[]; body: string }>;
  renderToStream?: (page: PageObject) => SsrStreamResult | Promise<SsrStreamResult>;
}

export interface SsrLoader {
  load(): Promise<SsrModule | null>;
}

export interface InertiaServiceDeps {
  assetVersion: string;
  manifest: Manifest | null;
  ssrLoader: SsrLoader;
  rootViewRender: (ctx: ShellRenderCtx) => Promise<string>;
  /**
   * Optional streaming seam: render the shell split into head/tail around the
   * app body. Present only when the shell renderer supports splitting; absence
   * disables streaming (buffered SSR still works).
   */
  rootViewRenderToParts?: ((ctx: ShellRenderCtx) => Promise<ShellParts>) | undefined;
  /** Opt-in to progressive SSR streaming when the bundle exposes a streaming entry. */
  ssrStreaming?: boolean | undefined;
  moduleShare: SharedInput | undefined;
  featureShare: SharedInput | undefined;
  historyEncryptionDefault?: boolean;
  flashStore: FlashStore | undefined;
  diagnostics?: boolean | undefined;
}

/**
 * Typed render overloads. When `InertiaPages` has been augmented by codegen,
 * calling `render('PageName', props)` constrains `props` to that page's
 * `ComponentProps` type. Without codegen, falls back to `Record<string, unknown>`.
 *
 * Uses interface-class declaration merging so the implementation signature
 * stays simple while callers get type safety.
 */
export interface InertiaService {
  render<K extends keyof InertiaPages>(
    component: K,
    props: InertiaPages[K] extends Record<string, unknown> ? InertiaPages[K] : Props,
  ): Promise<void>;
  render(component: string, props?: Props): Promise<void>;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: see above
export class InertiaService {
  private readonly logger = new Logger(InertiaService.name);
  private shared: SharedInput[] = [];
  private encryptHistoryFlag: boolean | undefined;
  private clearHistoryFlag = false;

  constructor(
    private readonly req: InertiaRequest,
    private readonly res: InertiaResponse,
    private readonly deps: InertiaServiceDeps,
  ) {}

  share(input: SharedInput): this {
    this.shared.push(input);
    return this;
  }

  /**
   * Flash general (non-error) data for the *next* request, Laravel/Rails-style.
   * The data is persisted via the configured `flashStore` and surfaced to the
   * client as the `flash` shared prop on the following render, then cleared.
   *
   * Supports both an object form and a key/value form:
   *
   * @example
   * await inertia.flash({ success: 'Saved!' });
   * await inertia.flash('status', 'profile-updated');
   *
   * No-ops (does not throw) when no `flashStore` is configured or the store does
   * not implement `writeFlash`.
   */
  async flash(data: FlashData): Promise<void>;
  async flash(key: string, value: unknown): Promise<void>;
  async flash(dataOrKey: FlashData | string, value?: unknown): Promise<void> {
    const store = this.deps.flashStore;
    if (!store?.writeFlash) return;
    const data: FlashData = typeof dataOrKey === 'string' ? { [dataOrKey]: value } : dataOrKey;
    try {
      await store.writeFlash(this.req.raw, data);
    } catch (err) {
      this.logger.warn(
        `FlashStore.writeFlash() threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Perform an Inertia redirect. For Inertia XHR requests, issues a 409 with
   * `X-Inertia-Location`; for plain browser visits, issues a 302 redirect.
   *
   * Only relative URLs (starting with `/`) or same-origin absolute URLs are
   * accepted. Absolute URLs pointing to a different host are rejected to prevent
   * open-redirect vulnerabilities.
   *
   * @param url Relative path (e.g. `/dashboard`) or same-origin absolute URL.
   * @throws Error when `url` is an absolute URL pointing to a different origin.
   */
  location(url: string): void {
    const safeUrl = validateLocationUrl(url);
    if (this.req.header('X-Inertia')) {
      this.res.status(409).setHeader('X-Inertia-Location', safeUrl).end();
    } else {
      this.res.status(302).setHeader('Location', safeUrl).end();
    }
  }

  encryptHistory(value = true): this {
    this.encryptHistoryFlag = value;
    return this;
  }

  clearHistory(): this {
    this.clearHistoryFlag = true;
    return this;
  }

  private async resolveShared(): Promise<Props> {
    const sources: SharedInput[] = [];
    if (this.deps.moduleShare !== undefined) sources.push(this.deps.moduleShare);
    if (this.deps.featureShare !== undefined) sources.push(this.deps.featureShare);
    sources.push(...this.shared);

    const out: Props = {};
    for (const s of sources) {
      const resolved = typeof s === 'function' ? await s(this.req) : s;
      Object.assign(out, resolved);
    }
    return out;
  }

  async render(component: string, props: Props = {}): Promise<void> {
    // Diagnostics gate — captured once. Zero-cost when no telescope watcher is
    // subscribed (or when hard-disabled via `diagnostics: false`).
    const diagOn = this.deps.diagnostics !== false && inertiaRenderChannel.hasSubscribers;

    // Version mismatch check (short-circuit before any factory resolution)
    const clientVersion = this.req.header('X-Inertia-Version');
    if (
      this.req.method === 'GET' &&
      this.req.header('X-Inertia') &&
      clientVersion !== undefined &&
      clientVersion !== this.deps.assetVersion
    ) {
      this.res.status(409).setHeader('X-Inertia-Location', this.req.originalUrl).end();
      if (diagOn) {
        const page: PageObject = {
          component,
          props: {},
          url: this.req.originalUrl,
          version: this.deps.assetVersion,
        };
        publishInertiaRender(
          buildDiagnostic(
            page,
            {
              sharedKeys: [],
              optionalKeys: [],
              onceKeys: [],
              excludedKeys: [],
              isPartial: false,
              keep: null,
              exceptKeys: [],
              resetKeys: [],
              resetOnceKeys: [],
              clientVersion: clientVersion ?? null,
            },
            { ssr: false, statusCode: 409, versionMismatch: true },
            {
              req: this.req,
              isInertia: true,
              resolvedProps: undefined,
              assetVersion: this.deps.assetVersion,
              encryptHistory: false,
              clearHistory: false,
              pageBytes: 0,
            },
          ),
        );
      }
      return;
    }

    // Auto-resolve errors from FlashStore if configured and not provided in props
    if (this.deps.flashStore && props.errors === undefined) {
      try {
        const flashed = await this.deps.flashStore.read(this.req.raw);
        if (flashed && Object.keys(flashed).length > 0) {
          this.share({ errors: flashed });
        }
      } catch (err) {
        // Log the failure so developers can debug flash store issues,
        // but don't crash the request — errors stay {}
        this.logger.warn(
          `FlashStore.read() threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Auto-resolve general flash data (success/info/etc.) from FlashStore and
    // surface it as the `flash` shared prop. `readFlash` is expected to be
    // consume-once (Laravel/Rails semantics): reading it clears it so it is gone
    // on the following request. Only shared when the store implements readFlash
    // and the caller has not already provided an explicit `flash` prop.
    if (this.deps.flashStore?.readFlash && props.flash === undefined) {
      try {
        const flash = await this.deps.flashStore.readFlash(this.req.raw);
        if (flash !== undefined && flash !== null) {
          this.share({ flash });
        }
      } catch (err) {
        this.logger.warn(
          `FlashStore.readFlash() threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const sharedProps = await this.resolveShared();
    const rawProps: Props = { ...sharedProps, ...props };
    if (rawProps.errors === undefined) rawProps.errors = {};

    const partialComponent = this.req.header('X-Inertia-Partial-Component');
    const isPartial = partialComponent === component;
    const partialDataHeader = this.req.header('X-Inertia-Partial-Data');
    const keepList =
      isPartial && partialDataHeader ? partialDataHeader.split(',').filter(Boolean) : null;
    const keep = keepList && keepList.length > 0 ? keepList : null;

    const resetHeader = this.req.header('X-Inertia-Reset');
    const resetKeys = resetHeader ? resetHeader.split(',').filter(Boolean) : EMPTY_KEYS;

    const resetOnceHeader = this.req.header('X-Inertia-Reset-Once');
    const resetOnceKeys = resetOnceHeader ? resetOnceHeader.split(',').filter(Boolean) : EMPTY_KEYS;

    const exceptHeader = this.req.header('X-Inertia-Partial-Except');
    const exceptKeys =
      isPartial && exceptHeader ? exceptHeader.split(',').filter(Boolean) : EMPTY_KEYS;

    const finalProps: Props = {};
    const deferredProps: Record<string, string[]> = {};
    const mergeProps: string[] = [];
    const deepMergeProps: string[] = [];
    const matchPropsOn: Record<string, string | string[]> = {};

    // Diagnostics-only marker classification bookkeeping. Only populated when
    // `diagOn`; the pushes below are cheap no-ops otherwise.
    const optionalKeys: string[] = [];
    const onceKeys: string[] = [];
    const excludedKeys: string[] = [];
    const sharedKeys = diagOn ? Object.keys(sharedProps) : [];

    for (const [key, value] of Object.entries(rawProps)) {
      if (exceptKeys.includes(key) && key !== 'errors') {
        if (diagOn) excludedKeys.push(key);
        continue;
      }
      if (isMarker(value)) {
        const kind = getMarkerKind(value);
        if (kind === 'always') {
          finalProps[key] = await getMarkerValue(value)();
          continue;
        }
        if (kind === 'optional') {
          if (diagOn) optionalKeys.push(key);
          if (keep?.includes(key)) {
            finalProps[key] = await getMarkerValue(value)();
          }
          continue;
        }
        if (kind === 'once') {
          if (diagOn) onceKeys.push(key);
          // Initial visit (no partial) OR explicit reset-once for this key
          if (!keep || resetOnceKeys.includes(key)) {
            finalProps[key] = await getMarkerValue(value)();
          }
          continue;
        }
        if (kind === 'defer') {
          if (keep) {
            if (keep.includes(key)) finalProps[key] = await getMarkerValue(value)();
            continue;
          }
          const meta = getMarkerMeta(value) as { group: string };
          const group = meta.group;
          const existing = deferredProps[group];
          if (existing) existing.push(key);
          else deferredProps[group] = [key];
          continue;
        }
        if (kind === 'merge') {
          const meta = getMarkerMeta(value) as { matchOn?: string | string[]; deep?: boolean };
          if (keep && !keep.includes(key) && key !== 'errors') continue;
          const resolved = await getMarkerValue(value)();
          finalProps[key] = resolved;
          // Suppress merge metadata if key is in X-Inertia-Reset
          if (!resetKeys.includes(key)) {
            if (meta.deep) deepMergeProps.push(key);
            else mergeProps.push(key);
          }
          if (meta.matchOn !== undefined) matchPropsOn[key] = meta.matchOn;
          continue;
        }
      }

      // Non-marker branch: filter by top-level key OR dot-path prefix, then resolve
      // A key passes if:
      //   (a) no partial filter (keep is null), OR
      //   (b) errors key (always included), OR
      //   (c) exact match in keep list, OR
      //   (d) a keep entry is a dot-path starting with this key (e.g. keep=["user.avatar"] passes key="user")
      //   (e) value contains a nested always() marker (always() must resolve regardless of partial filter)
      const hasNestedKeepPath = keep?.some((k) => k.startsWith(`${key}.`)) ?? false;
      // Markers are always objects, so primitives/null can never contain an
      // always() marker — skip the recursive scan for them.
      const hasNestedAlways =
        keep && typeof value === 'object' && value !== null ? containsAlwaysMarker(value) : false;
      if (
        keep &&
        !keep.includes(key) &&
        key !== 'errors' &&
        !hasNestedKeepPath &&
        !hasNestedAlways
      ) {
        if (diagOn) excludedKeys.push(key);
        continue;
      }

      let resolved: unknown = value;
      if (typeof value === 'function') {
        resolved = await (value as () => unknown | Promise<unknown>)();
      }

      // v3: recursively resolve nested markers inside plain objects/arrays.
      // Build a "sub-keep" list: for paths like "user.avatar", when processing key="user",
      // pass "avatar" as the sub-path so the nested resolver knows what to include.
      // null means "include everything (no filter)", [] would mean include nothing.
      let nestedKeep: string[] | null = null;
      if (keep !== null) {
        if (keep.includes(key)) {
          // Exact match: include all children (null = unfiltered)
          nestedKeep = null;
        } else {
          // Only dot-path sub-entries are in keep; filter children accordingly
          nestedKeep = keep
            .filter((k) => k.startsWith(`${key}.`))
            .map((k) => k.slice(key.length + 1));
        }
      }

      if (typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)) {
        // Walk nested object for markers
        resolved = await resolveNestedObjectValue(resolved as Record<string, unknown>, {
          topKey: key,
          subKeep: nestedKeep,
          isFullReload: keep === null,
          resetOnceKeys,
          deferredProps,
        });
      }

      finalProps[key] = resolved;
    }

    // Dot-notation unpacking (top-level keys with '.')
    const unpackedProps = unpackDotKeys(finalProps);

    // undefined → null wire conversion
    const wireProps = nullifyUndefined(unpackedProps);

    const page: PageObject = {
      component,
      props: wireProps,
      url: this.req.originalUrl,
      version: this.deps.assetVersion,
    };
    if (Object.keys(deferredProps).length > 0) page.deferredProps = deferredProps;
    if (mergeProps.length > 0) page.mergeProps = mergeProps;
    if (deepMergeProps.length > 0) page.deepMergeProps = deepMergeProps;
    if (Object.keys(matchPropsOn).length > 0) page.matchPropsOn = matchPropsOn;
    // v3: only emit encryptHistory / clearHistory when truthy
    const encryptHistory =
      this.encryptHistoryFlag !== undefined
        ? this.encryptHistoryFlag
        : (this.deps.historyEncryptionDefault ?? false);
    if (encryptHistory) page.encryptHistory = true;
    if (this.clearHistoryFlag) page.clearHistory = true;

    const isInertia = !!this.req.header('X-Inertia');

    // Publish one diagnostic per response (XHR path). `pageBytes` reuses the same
    // serialization `.json(page)` needs; `resolvedProps` is passed BY REFERENCE so
    // telescope's redactBounded clips/masks it (never pre-stringified here).
    if (isInertia) {
      if (diagOn) {
        publishInertiaRender(
          this.buildRenderDiagnostic(page, sharedKeys, {
            isPartial,
            keep,
            exceptKeys,
            resetKeys,
            resetOnceKeys,
            optionalKeys,
            onceKeys,
            excludedKeys,
            clientVersion: clientVersion ?? null,
            encryptHistory,
            ssr: false,
          }),
        );
      }
      this.res.setHeader('X-Inertia', 'true').setHeader('Vary', 'X-Inertia').json(page);
      return;
    }

    const ssrModule = await this.deps.ssrLoader.load();

    // Streaming SSR path: enabled, bundle exposes a streaming entry, and the
    // shell renderer can split into head/tail. Falls through to buffered SSR
    // otherwise so behaviour is identical when any prerequisite is missing.
    const canStream =
      this.deps.ssrStreaming === true &&
      typeof ssrModule?.renderToStream === 'function' &&
      typeof this.deps.rootViewRenderToParts === 'function';

    if (canStream) {
      // `ssrModule` and `rootViewRenderToParts` are narrowed by `canStream`.
      const renderToStream = ssrModule.renderToStream as NonNullable<SsrModule['renderToStream']>;
      const renderToParts = this.deps.rootViewRenderToParts as NonNullable<
        InertiaServiceDeps['rootViewRenderToParts']
      >;
      const streamed = await this.tryStream(page, renderToStream, renderToParts);
      if (streamed) {
        if (diagOn) {
          publishInertiaRender(
            this.buildRenderDiagnostic(page, sharedKeys, {
              isPartial,
              keep,
              exceptKeys,
              resetKeys,
              resetOnceKeys,
              optionalKeys,
              onceKeys,
              excludedKeys,
              clientVersion: clientVersion ?? null,
              encryptHistory,
              ssr: true,
            }),
          );
        }
        return;
      }
      // Streaming failed before any byte was written → fall back to buffered SSR.
    }

    const ssr = ssrModule ? await ssrModule.render(page) : null;
    const html = await this.deps.rootViewRender({
      page,
      ssr,
      manifest: this.deps.manifest,
      assetVersion: this.deps.assetVersion,
      ctx: { req: this.req.raw, res: this.res.raw },
    });
    // SSR/HTML path: publish after `ssr` is known so the flag is accurate. The page
    // JSON is serialized only inside this guard, keeping cost off the hot path when
    // no watcher is subscribed.
    if (diagOn) {
      publishInertiaRender(
        this.buildRenderDiagnostic(page, sharedKeys, {
          isPartial,
          keep,
          exceptKeys,
          resetKeys,
          resetOnceKeys,
          optionalKeys,
          onceKeys,
          excludedKeys,
          clientVersion: clientVersion ?? null,
          encryptHistory,
          ssr: ssr !== null,
        }),
      );
    }
    this.res.setHeader('Vary', 'X-Inertia').html(html);
  }

  /**
   * Stream the SSR response progressively: render the shell head (with the SSR
   * head fragments), flush it, pipe the bundle's app HTML, then write the shell
   * tail and end. Returns `true` on success; returns `false` (without writing
   * anything) when the stream cannot be started so the caller can fall back to
   * buffered SSR. Once the first byte is written, a mid-stream error can no
   * longer fall back — it ends the (partial) response.
   */
  private async tryStream(
    page: PageObject,
    renderToStream: NonNullable<SsrModule['renderToStream']>,
    renderToParts: NonNullable<InertiaServiceDeps['rootViewRenderToParts']>,
  ): Promise<boolean> {
    let streamResult: SsrStreamResult;
    let parts: ShellParts;
    try {
      streamResult = await renderToStream(page);
      parts = await renderToParts({
        page,
        ssr: { head: streamResult.head ?? [], body: '' },
        manifest: this.deps.manifest,
        assetVersion: this.deps.assetVersion,
        ctx: { req: this.req.raw, res: this.res.raw },
      });
    } catch (err) {
      // Nothing written yet — safe to fall back to buffered SSR.
      this.logger.warn(
        `SSR streaming setup failed, falling back to buffered SSR: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }

    this.res.setHeader('Vary', 'X-Inertia');
    const sink = this.res.htmlStream(parts.head);

    return new Promise<boolean>((resolvePromise) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        sink.end(parts.tail);
        resolvePromise(true);
      };
      // Bridge the bundle's writable: the bundle writes app HTML; when it ends
      // its stream we append the shell tail and close the response. We never let
      // the bundle close the real response directly.
      const writable = {
        write: (chunk: string | Uint8Array): boolean =>
          sink.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')),
        end: (chunk?: string | Uint8Array): void => {
          if (chunk !== undefined) {
            sink.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          }
          finish();
        },
      };
      try {
        streamResult.pipe(writable);
      } catch (err) {
        // Mid-stream failure after head was flushed: we cannot fall back, so end
        // the response with the tail to keep the document well-formed.
        this.logger.warn(
          `SSR stream pipe threw after head flush: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        finish();
      }
    });
  }

  /**
   * Builds the full `InertiaRenderDiagnostic` for a 200 response, delegating the
   * payload shape to the pure {@link buildDiagnostic}. Only called when the
   * diagnostics gate is open. `resolvedProps` is the live wire-props object
   * (`page.props`) passed by reference — telescope's recorder redacts/clips it.
   */
  private buildRenderDiagnostic(
    page: PageObject,
    sharedKeys: string[],
    meta: {
      isPartial: boolean;
      keep: string[] | null;
      exceptKeys: string[];
      resetKeys: string[];
      resetOnceKeys: string[];
      optionalKeys: string[];
      onceKeys: string[];
      excludedKeys: string[];
      clientVersion: string | null;
      encryptHistory: boolean;
      ssr: boolean;
    },
  ): InertiaRenderDiagnostic {
    return buildDiagnostic(
      page,
      {
        sharedKeys,
        optionalKeys: meta.optionalKeys,
        onceKeys: meta.onceKeys,
        excludedKeys: meta.excludedKeys,
        isPartial: meta.isPartial,
        keep: meta.keep,
        exceptKeys: meta.exceptKeys,
        resetKeys: meta.resetKeys,
        resetOnceKeys: meta.resetOnceKeys,
        clientVersion: meta.clientVersion,
      },
      { ssr: meta.ssr, statusCode: 200, versionMismatch: false },
      {
        req: this.req,
        isInertia: !!this.req.header('X-Inertia'),
        resolvedProps: page.props,
        assetVersion: this.deps.assetVersion,
        encryptHistory: meta.encryptHistory,
        clearHistory: this.clearHistoryFlag,
        pageBytes: Buffer.byteLength(JSON.stringify(page), 'utf8'),
      },
    );
  }
}
