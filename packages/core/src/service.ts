import type { InertiaRequest, InertiaResponse } from './adapter/adapter.js';
import type { PageObject, Props, SharedInput, ShellRenderCtx } from './types.js';
import type { Manifest } from './asset/version.provider.js';
import { isMarker, getMarkerKind, getMarkerValue, getMarkerMeta } from './markers.js';

export interface SsrModule {
  render(page: PageObject): Promise<{ head: string[]; body: string }>;
}

export interface SsrLoader {
  load(): Promise<SsrModule | null>;
}

export interface InertiaServiceDeps {
  assetVersion: string;
  manifest: Manifest | null;
  ssrLoader: SsrLoader;
  rootViewRender: (ctx: ShellRenderCtx) => Promise<string>;
  moduleShare: SharedInput | undefined;
  featureShare: SharedInput | undefined;
  historyEncryptionDefault?: boolean;
}

export class InertiaService {
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

  location(url: string): void {
    this.res.status(409).setHeader('X-Inertia-Location', url).end();
  }

  encryptHistory(value: boolean = true): this {
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
    // Version mismatch check FIRST — short-circuits before resolving any factories
    const clientVersion = this.req.header('X-Inertia-Version');
    if (
      this.req.method === 'GET' &&
      this.req.header('X-Inertia') &&
      clientVersion !== undefined &&
      clientVersion !== this.deps.assetVersion
    ) {
      this.res.status(409).setHeader('X-Inertia-Location', this.req.originalUrl).end();
      return;
    }

    const sharedProps = await this.resolveShared();
    const rawProps: Props = { ...sharedProps, ...props };
    if (rawProps['errors'] === undefined) rawProps['errors'] = {};

    const partialComponent = this.req.header('X-Inertia-Partial-Component');
    const isPartial = partialComponent === component;
    const partialDataHeader = this.req.header('X-Inertia-Partial-Data');
    const keep = isPartial ? (partialDataHeader ?? '').split(',').filter(Boolean) : null;

    const finalProps: Props = {};
    const deferredProps: Record<string, string[]> = {};
    const mergeProps: string[] = [];
    const deepMergeProps: string[] = [];
    const matchPropsOn: Record<string, string> = {};

    for (const [key, value] of Object.entries(rawProps)) {
      if (isMarker(value)) {
        const kind = getMarkerKind(value);
        if (kind === 'always') {
          finalProps[key] = await getMarkerValue(value)();
          continue;
        }
        if (kind === 'optional') {
          if (keep && keep.includes(key)) {
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
          const meta = getMarkerMeta(value) as { matchOn?: string; deep?: boolean };
          if (keep && !keep.includes(key) && key !== 'errors') continue;
          const resolved = await getMarkerValue(value)();
          finalProps[key] = resolved;
          if (meta.deep) deepMergeProps.push(key);
          else mergeProps.push(key);
          if (meta.matchOn !== undefined) matchPropsOn[key] = meta.matchOn;
          continue;
        }
      }
      if (keep && !keep.includes(key) && key !== 'errors') continue;
      finalProps[key] = value;
    }

    const page: PageObject = {
      component,
      props: finalProps,
      url: this.req.originalUrl,
      version: this.deps.assetVersion,
    };
    if (Object.keys(deferredProps).length > 0) page.deferredProps = deferredProps;
    if (mergeProps.length > 0) page.mergeProps = mergeProps;
    if (deepMergeProps.length > 0) page.deepMergeProps = deepMergeProps;
    if (Object.keys(matchPropsOn).length > 0) page.matchPropsOn = matchPropsOn;
    if (this.encryptHistoryFlag !== undefined) page.encryptHistory = this.encryptHistoryFlag;
    else if (this.deps.historyEncryptionDefault) page.encryptHistory = true;
    if (this.clearHistoryFlag) page.clearHistory = true;

    if (this.req.header('X-Inertia')) {
      this.res
        .setHeader('X-Inertia', 'true')
        .setHeader('Vary', 'X-Inertia')
        .json(page);
      return;
    }

    const ssrModule = await this.deps.ssrLoader.load();
    const ssr = ssrModule ? await ssrModule.render(page) : null;
    const html = await this.deps.rootViewRender({
      page,
      ssr,
      manifest: this.deps.manifest,
      assetVersion: this.deps.assetVersion,
      ctx: { req: this.req.raw, res: this.res.raw },
    });
    this.res.setHeader('Vary', 'X-Inertia').html(html);
  }
}
