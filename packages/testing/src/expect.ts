export interface PageObject {
  component: string;
  props: Record<string, unknown>;
  url: string;
  version: string;
  encryptHistory?: boolean;
  clearHistory?: boolean;
  deferredProps?: Record<string, string[]>;
  mergeProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: Record<string, string>;
}

interface ResponseLike {
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  text?: string;
}

function getNested(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function fail(msg: string, ctx: { component?: string; props?: unknown }): never {
  let extras = '';
  if (ctx.component) extras += `\n  Component: ${ctx.component}`;
  if (ctx.props !== undefined) {
    const keys = ctx.props && typeof ctx.props === 'object' ? Object.keys(ctx.props as object) : [];
    extras += `\n  Available props: ${keys.join(', ') || '(none)'}`;
  }
  throw new Error(`${msg}${extras}`);
}

export class InertiaAssertion {
  constructor(private readonly res: ResponseLike) {}

  private page(): PageObject {
    const body = this.res.body as PageObject | undefined;
    if (!body || typeof body !== 'object' || typeof body.component !== 'string') {
      fail('Response body is not a valid Inertia page object', { props: this.res.body });
    }
    return body as PageObject;
  }

  toRenderComponent(name: string): this {
    const page = this.page();
    if (page.component !== name) {
      fail(`Expected component "${name}", got "${page.component}"`, page);
    }
    return this;
  }

  toHaveUrl(url: string | RegExp): this {
    const page = this.page();
    const match = typeof url === 'string' ? page.url === url : url.test(page.url);
    if (!match) {
      fail(`Expected url to match ${url}, got "${page.url}"`, page);
    }
    return this;
  }

  toHaveVersion(matcher: string | RegExp): this {
    const page = this.page();
    const match = typeof matcher === 'string' ? page.version === matcher : matcher.test(page.version);
    if (!match) {
      fail(`Expected version to match ${matcher}, got "${page.version}"`, page);
    }
    return this;
  }

  toHaveProp(path: string, value?: unknown): this {
    const page = this.page();
    const actual = getNested(page.props, path);
    if (actual === undefined) {
      fail(`Expected prop "${path}" to be defined`, page);
    }
    if (value !== undefined && JSON.stringify(actual) !== JSON.stringify(value)) {
      fail(`Expected prop "${path}" = ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`, page);
    }
    return this;
  }

  toHavePropMatching(path: string, pattern: RegExp): this {
    const page = this.page();
    const actual = getNested(page.props, path);
    if (typeof actual !== 'string' || !pattern.test(actual)) {
      fail(`Expected prop "${path}" to match ${pattern}, got ${JSON.stringify(actual)}`, page);
    }
    return this;
  }

  toMissProp(path: string): this {
    const page = this.page();
    const actual = getNested(page.props, path);
    if (actual !== undefined) {
      fail(`Expected prop "${path}" to be missing, found ${JSON.stringify(actual)}`, page);
    }
    return this;
  }

  toHaveExactProps(props: Record<string, unknown>): this {
    const page = this.page();
    if (JSON.stringify(page.props) !== JSON.stringify(props)) {
      fail(`Expected exact props ${JSON.stringify(props)}, got ${JSON.stringify(page.props)}`, page);
    }
    return this;
  }

  toShareProp(path: string, value?: unknown): this {
    return this.toHaveProp(path, value);
  }

  pageObject(): PageObject {
    return this.page();
  }

  unwrap(): { component: string; props: Record<string, unknown>; url: string; version: string } {
    const p = this.page();
    return { component: p.component, props: p.props, url: p.url, version: p.version };
  }
}

export function expectInertia(res: ResponseLike): InertiaAssertion {
  return new InertiaAssertion(res);
}
