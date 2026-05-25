import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/config/types.js';

/**
 * Tests for the watch-mode and tsconfig branches of runCodegen
 * (covering lines 28-36 and 43 of src/cli/codegen.ts).
 */

// --- Mocks ---

// Use a stable close function that always returns a Promise so that
// lingering signal listeners from prior tests never blow up with
// "Cannot read properties of undefined (reading 'then')".
const mockWatcherClose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockWatch = vi
  .fn()
  .mockImplementation(() => Promise.resolve({ close: () => mockWatcherClose() }));
const mockGenerate = vi.fn().mockResolvedValue(undefined);
const mockDiscoverContractsFast = vi.fn().mockResolvedValue([]);

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    pages: {
      glob: '**/*.tsx',
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
    },
    contracts: { glob: 'src/**/*.controller.ts', debounceMs: 500 },
    scopes: {},
    codegen: { outDir: '/tmp/test-out', cwd: '/tmp/test-cwd' },
    app: null,
    ...overrides,
  };
}

const mockLoadConfig = vi.fn<(cwd: string) => Promise<ResolvedConfig>>();

vi.mock('../../src/config/load-config.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(args[0] as string),
}));

vi.mock('../../src/watch/watcher.js', () => ({
  watch: (...args: unknown[]) => mockWatch(...args),
}));

vi.mock('../../src/generate.js', () => ({
  generate: (...args: unknown[]) => mockGenerate(...args),
}));

vi.mock('../../src/discovery/contracts-fast.js', () => ({
  discoverContractsFast: (...args: unknown[]) => mockDiscoverContractsFast(...args),
}));

// Use a dynamic import after mocks are set up
let runCodegen: typeof import('../../src/cli/codegen.js').runCodegen;

beforeEach(async () => {
  // Re-set mock implementations (clearAllMocks would strip them)
  mockWatcherClose.mockReset().mockResolvedValue(undefined);
  mockWatch
    .mockReset()
    .mockImplementation(() => Promise.resolve({ close: () => mockWatcherClose() }));
  mockGenerate.mockReset().mockResolvedValue(undefined);
  mockDiscoverContractsFast.mockReset().mockResolvedValue([]);
  mockLoadConfig.mockReset();

  const mod = await import('../../src/cli/codegen.js');
  runCodegen = mod.runCodegen;
});

afterEach(() => {
  // Remove any lingering signal listeners registered by runCodegen's watch mode
  // to prevent them from firing in later tests with stale closures.
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
});

describe('runCodegen watch mode (lines 28-36)', () => {
  it('starts watcher and resolves when SIGINT is fired', async () => {
    const config = makeConfig();
    mockLoadConfig.mockResolvedValue(config);

    // Start runCodegen in watch mode -- it will block on the signal promise
    const codegenPromise = runCodegen({ watch: true, cwd: '/tmp/test' });

    // Give the promise microtask queue time to set up the signal listeners
    await new Promise((r) => setTimeout(r, 10));

    // Emit SIGINT to trigger the onSignal handler (line 29-31)
    process.emit('SIGINT', 'SIGINT');

    // The promise should now resolve
    await expect(codegenPromise).resolves.toBeUndefined();

    // Verify watch was called with the config
    expect(mockWatch).toHaveBeenCalledWith(config);
    // Verify watcher.close() was called
    expect(mockWatcherClose).toHaveBeenCalled();
    // generate should NOT have been called in watch mode
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('starts watcher and resolves when SIGTERM is fired', async () => {
    const config = makeConfig();
    mockLoadConfig.mockResolvedValue(config);

    const codegenPromise = runCodegen({ watch: true, cwd: '/tmp/test' });

    await new Promise((r) => setTimeout(r, 10));

    process.emit('SIGTERM', 'SIGTERM');

    await expect(codegenPromise).resolves.toBeUndefined();

    expect(mockWatch).toHaveBeenCalledWith(config);
    expect(mockWatcherClose).toHaveBeenCalled();
  });

  it('resolves even when watcher.close() rejects', async () => {
    const config = makeConfig();
    mockLoadConfig.mockResolvedValue(config);
    mockWatcherClose.mockRejectedValueOnce(new Error('close error'));

    const codegenPromise = runCodegen({ watch: true, cwd: '/tmp/test' });

    await new Promise((r) => setTimeout(r, 10));

    process.emit('SIGINT', 'SIGINT');

    // Should still resolve (the .catch(resolve) on line 30 ensures this)
    await expect(codegenPromise).resolves.toBeUndefined();
  });
});

describe('runCodegen one-shot with tsconfig (line 43)', () => {
  it('passes tsconfig to discoverContractsFast when config.app.tsconfig is set', async () => {
    const config = makeConfig({
      app: { moduleEntry: '/tmp/app.module.ts', tsconfig: '/tmp/tsconfig.json' },
    });
    mockLoadConfig.mockResolvedValue(config);
    mockDiscoverContractsFast.mockResolvedValue([]);
    // Suppress the console.log from the success message
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodegen({ cwd: '/tmp/test' });

    expect(mockDiscoverContractsFast).toHaveBeenCalledWith({
      cwd: '/tmp/test-cwd',
      glob: 'src/**/*.controller.ts',
      tsconfig: '/tmp/tsconfig.json',
    });
    expect(mockGenerate).toHaveBeenCalledWith(config, []);
  });

  it('does not pass tsconfig when config.app is null', async () => {
    const config = makeConfig({ app: null });
    mockLoadConfig.mockResolvedValue(config);
    mockDiscoverContractsFast.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodegen({ cwd: '/tmp/test' });

    expect(mockDiscoverContractsFast).toHaveBeenCalledWith({
      cwd: '/tmp/test-cwd',
      glob: 'src/**/*.controller.ts',
    });
  });

  it('does not pass tsconfig when config.app.tsconfig is null', async () => {
    const config = makeConfig({
      app: { moduleEntry: '/tmp/app.module.ts', tsconfig: null },
    });
    mockLoadConfig.mockResolvedValue(config);
    mockDiscoverContractsFast.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodegen({ cwd: '/tmp/test' });

    // tsconfig is falsy (null), so it should NOT be in the options
    expect(mockDiscoverContractsFast).toHaveBeenCalledWith({
      cwd: '/tmp/test-cwd',
      glob: 'src/**/*.controller.ts',
    });
  });

  it('uses process.cwd() when no cwd option is provided', async () => {
    const config = makeConfig();
    mockLoadConfig.mockResolvedValue(config);
    mockDiscoverContractsFast.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCodegen();

    expect(mockLoadConfig).toHaveBeenCalledWith(process.cwd());
  });
});
