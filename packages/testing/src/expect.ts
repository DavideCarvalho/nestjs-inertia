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

  toHaveDeferredProp(name: string, group?: string): this {
    const page = this.page();
    const deferred = page.deferredProps ?? {};
    const matchingGroup = group ? deferred[group] : Object.values(deferred).flat();
    if (!matchingGroup || !matchingGroup.includes(name)) {
      fail(`Expected deferred prop "${name}"${group ? ` in group "${group}"` : ''}, got ${JSON.stringify(deferred)}`, page);
    }
    return this;
  }

  toHaveMergeProp(name: string, opts?: { matchOn?: string; strategy?: 'append' | 'prepend' }): this {
    const page = this.page();
    const merge = page.mergeProps ?? [];
    const deepMerge = page.deepMergeProps ?? [];
    const all = [...merge, ...deepMerge];
    if (!all.includes(name)) {
      fail(`Expected merge prop "${name}", got mergeProps=${JSON.stringify(merge)}, deepMergeProps=${JSON.stringify(deepMerge)}`, page);
    }
    if (opts?.matchOn !== undefined) {
      const actual = page.matchPropsOn?.[name];
      if (actual !== opts.matchOn) {
        fail(`Expected matchOn[${name}] = "${opts.matchOn}", got "${actual}"`, page);
      }
    }
    return this;
  }

  toHaveAlwaysProp(name: string): this {
    // Always props are not tracked separately on the wire — they just appear in props.
    // This assertion confirms the prop is present, mirroring toHaveProp.
    return this.toHaveProp(name);
  }

  toHaveOptionalProp(name: string): this {
    // Same — optional props that resolved appear in props normally.
    return this.toHaveProp(name);
  }

  toRedirectExternal(url: string): this {
    if (this.res.status !== 409) {
      throw new Error(`Expected status 409 (external redirect), got ${this.res.status}`);
    }
    const loc = this.res.headers['x-inertia-location'];
    if (loc !== url) {
      throw new Error(`Expected X-Inertia-Location "${url}", got "${loc}"`);
    }
    return this;
  }

  toRedirectTo(url: string, status?: 302 | 303): this {
    if (status !== undefined && this.res.status !== status) {
      throw new Error(`Expected status ${status}, got ${this.res.status}`);
    }
    const loc = this.res.headers['location'];
    if (loc !== url) {
      throw new Error(`Expected Location "${url}", got "${loc}"`);
    }
    return this;
  }

  toHaveErrors(errors: Record<string, string | RegExp>): this {
    const page = this.page();
    const actual = (page.props.errors ?? {}) as Record<string, unknown>;
    for (const [key, expected] of Object.entries(errors)) {
      const got = actual[key];
      if (expected instanceof RegExp) {
        if (typeof got !== 'string' || !expected.test(got)) {
          fail(`Expected errors["${key}"] to match ${expected}, got ${JSON.stringify(got)}`, page);
        }
      } else if (got !== expected) {
        fail(`Expected errors["${key}"] = "${expected}", got ${JSON.stringify(got)}`, page);
      }
    }
    return this;
  }

  toHaveErrorBag(bag: string): this {
    const page = this.page();
    const errors = (page.props.errors ?? {}) as Record<string, unknown>;
    if (typeof errors[bag] !== 'object' || errors[bag] === null) {
      fail(`Expected errors bag "${bag}" to be an object, got ${JSON.stringify(errors[bag])}`, page);
    }
    return this;
  }

  toRenderFullHtml(): this {
    const contentType = this.res.headers['content-type'];
    const ct = Array.isArray(contentType) ? contentType[0] : contentType;
    if (!ct || !ct.includes('html')) {
      throw new Error(`Expected HTML response, got content-type "${ct}"`);
    }
    return this;
  }

  withSsrHead(pattern: RegExp): this {
    const text = this.res.text ?? (typeof this.res.body === 'string' ? this.res.body : '');
    if (!pattern.test(text)) {
      throw new Error(`Expected SSR head to match ${pattern}, got body fragment: ${text.slice(0, 200)}...`);
    }
    return this;
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
