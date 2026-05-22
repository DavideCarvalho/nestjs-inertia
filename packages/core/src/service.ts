import type { InertiaRequest, InertiaResponse } from './adapter/adapter.js';
import type { PageObject, Props, SharedInput, ShellRenderCtx } from './types.js';
import type { Manifest } from './asset/version.provider.js';

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
    const sharedProps = await this.resolveShared();
    const merged: Props = {
      ...sharedProps,
      ...props,
      errors: (props['errors'] as Props | undefined) ?? (sharedProps['errors'] as Props | undefined) ?? {},
    };

    const page: PageObject = {
      component,
      props: merged,
      url: this.req.originalUrl,
      version: this.deps.assetVersion,
    };

    if (this.encryptHistoryFlag !== undefined) {
      page.encryptHistory = this.encryptHistoryFlag;
    } else if (this.deps.historyEncryptionDefault) {
      page.encryptHistory = true;
    }

    if (this.clearHistoryFlag) {
      page.clearHistory = true;
    }

    const clientVersion = this.req.header('X-Inertia-Version');
    if (
      this.req.method === 'GET' &&
      this.req.header('X-Inertia') !== undefined &&
      clientVersion !== undefined &&
      clientVersion !== this.deps.assetVersion
    ) {
      this.res.status(409).setHeader('X-Inertia-Location', this.req.originalUrl).end();
      return;
    }

    if (this.req.header('X-Inertia') !== undefined) {
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
