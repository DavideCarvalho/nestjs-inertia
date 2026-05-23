/**
 * Tests for InertiaModule codegen auto-bootstrap lifecycle.
 *
 * Strategy: subclass InertiaModule overriding the protected `_resolveCodegenModule`
 * seam so we inject a stub without touching NestJS DI or the production import path.
 * Constructor params use the same order as InertiaModule.
 */
import type { HttpAdapterHost } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InertiaModule } from '../src/module.js';
import type { InertiaModuleOptions } from '../src/types.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FakeCodegenModule {
  loadConfig: ReturnType<typeof vi.fn>;
  watch: ReturnType<typeof vi.fn>;
}

interface FakeWatcher {
  close: ReturnType<typeof vi.fn>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAdapterHost(): HttpAdapterHost {
  // Stub HttpAdapterHost with no adapter so the Fastify branch is skipped.
  return { httpAdapter: null } as unknown as HttpAdapterHost;
}

const FAKE_CONFIG = { codegen: { outDir: '/tmp/.nestjs-inertia' } };

function makeFakeWatcher(): FakeWatcher {
  return { close: vi.fn<[], Promise<void>>().mockResolvedValue(undefined) };
}

function makeCodegenStub(
  opts: {
    loadConfigThrows?: boolean;
    watcher?: FakeWatcher;
  } = {},
): FakeCodegenModule {
  const watcher = opts.watcher ?? makeFakeWatcher();
  return {
    loadConfig: opts.loadConfigThrows
      ? vi.fn().mockRejectedValue(new Error('no config'))
      : vi.fn().mockResolvedValue(FAKE_CONFIG),
    watch: vi.fn().mockResolvedValue(watcher),
  };
}

/**
 * Create a test subclass of InertiaModule that overrides `_resolveCodegenModule`
 * with the provided stub (or throws if stubFn itself throws).
 */
function makeModule(
  options: InertiaModuleOptions,
  stubFn: (() => Promise<FakeCodegenModule>) | (() => never) = () => {
    throw new Error('Cannot find module');
  },
): InertiaModule {
  class TestInertiaModule extends InertiaModule {
    protected override _resolveCodegenModule() {
      return stubFn() as unknown as Promise<never>;
    }
  }

  return new TestInertiaModule(
    makeAdapterHost(),
    options,
    /* assetVersion */ 'v1',
    /* manifest */ null,
    /* shellRenderer */ { render: async () => '' } as never,
    /* ssrLoader */ { load: async () => null } as never,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('InertiaModule — codegen auto-bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('Test 1: no-op when NODE_ENV === "production" (_resolveCodegenModule never called)', async () => {
    process.env.NODE_ENV = 'production';

    const stubFn = vi.fn<[], Promise<FakeCodegenModule>>();
    const mod = makeModule({}, stubFn);

    await mod.onApplicationBootstrap();

    expect(stubFn).not.toHaveBeenCalled();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBeNull();
  });

  it('Test 2: no-op when codegen.enabled === false (even in dev)', async () => {
    process.env.NODE_ENV = 'development';

    const stubFn = vi.fn<[], Promise<FakeCodegenModule>>();
    const mod = makeModule({ codegen: { enabled: false } }, stubFn);

    await mod.onApplicationBootstrap();

    expect(stubFn).not.toHaveBeenCalled();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBeNull();
  });

  it('Test 3: silently skips when codegen package is unresolvable (no throw)', async () => {
    process.env.NODE_ENV = 'development';

    const stubFn = vi.fn().mockRejectedValue(new Error('Cannot find module'));
    const mod = makeModule({}, stubFn);

    // Must not throw
    await expect(mod.onApplicationBootstrap()).resolves.toBeUndefined();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBeNull();
  });

  it('Test 4: when codegen resolves AND config loads, watch() is called and watcher stored', async () => {
    process.env.NODE_ENV = 'development';

    const fakeWatcher = makeFakeWatcher();
    const stub = makeCodegenStub({ watcher: fakeWatcher });
    const stubFn = vi.fn().mockResolvedValue(stub);
    const mod = makeModule({}, stubFn);

    await mod.onApplicationBootstrap();

    expect(stubFn).toHaveBeenCalledOnce();
    expect(stub.loadConfig).toHaveBeenCalledOnce();
    expect(stub.watch).toHaveBeenCalledOnce();
    expect(stub.watch).toHaveBeenCalledWith(FAKE_CONFIG);
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBe(fakeWatcher);
  });

  it('Test 5: onApplicationShutdown calls watcher.close() and clears the reference', async () => {
    process.env.NODE_ENV = 'development';

    const fakeWatcher = makeFakeWatcher();
    const stub = makeCodegenStub({ watcher: fakeWatcher });
    const mod = makeModule({}, vi.fn().mockResolvedValue(stub));

    await mod.onApplicationBootstrap();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBe(fakeWatcher);

    await mod.onApplicationShutdown();

    expect(fakeWatcher.close).toHaveBeenCalledOnce();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBeNull();
  });

  it('Test 6: silently skips when loadConfig throws (no config file present)', async () => {
    process.env.NODE_ENV = 'development';

    const stub = makeCodegenStub({ loadConfigThrows: true });
    const mod = makeModule({}, vi.fn().mockResolvedValue(stub));

    await expect(mod.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(stub.watch).not.toHaveBeenCalled();
    expect((mod as unknown as { codegenWatcher: unknown }).codegenWatcher).toBeNull();
  });

  it('Test 7: enabled === "auto" starts watcher in dev (same as default)', async () => {
    process.env.NODE_ENV = 'development';

    const stub = makeCodegenStub();
    const mod = makeModule({ codegen: { enabled: 'auto' } }, vi.fn().mockResolvedValue(stub));

    await mod.onApplicationBootstrap();

    expect(stub.watch).toHaveBeenCalledOnce();
  });

  it('Test 8: enabled === true starts watcher in dev', async () => {
    process.env.NODE_ENV = 'development';

    const stub = makeCodegenStub();
    const mod = makeModule({ codegen: { enabled: true } }, vi.fn().mockResolvedValue(stub));

    await mod.onApplicationBootstrap();

    expect(stub.watch).toHaveBeenCalledOnce();
  });
});
