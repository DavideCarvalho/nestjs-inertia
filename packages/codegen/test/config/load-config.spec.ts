import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/load-config.js';
import { ConfigError } from '../../src/exceptions.js';

function makeTmpDir(): string {
  return join(tmpdir(), `nestjs-inertia-codegen-test-${randomUUID()}`);
}

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    // Force tsx to use ESM loader (not its CJS virtual module that references __filename)
    await writeFile(join(tmpDir, 'package.json'), '{"type":"module"}');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads a .ts config via tsx and applies defaults', async () => {
    // Use a plain default export (defineConfig is identity, not strictly required in tests)
    await writeFile(
      join(tmpDir, 'nestjs-inertia.config.ts'),
      `
const config = {
  pages: {
    glob: 'inertia/pages/**/*.tsx',
  },
};
export default config;
`,
    );

    const config = await loadConfig(tmpDir);

    expect(config.pages.glob).toBe('inertia/pages/**/*.tsx');
    expect(config.pages.propsExport).toBe('ComponentProps');
    expect(config.pages.componentNameStrategy).toBe('relative-no-ext');

    // codegen defaults resolved as absolute paths
    expect(config.codegen.outDir).toBe(join(tmpDir, '.nestjs-inertia'));
    expect(config.codegen.cwd).toBe(tmpDir);
  });

  it('throws ConfigError when config file is missing', async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError);
  });

  it('applies all defaults when user config is minimal', async () => {
    await writeFile(
      join(tmpDir, 'nestjs-inertia.config.ts'),
      `export default { pages: { glob: 'src/pages/**/*.vue' } };`,
    );

    const config = await loadConfig(tmpDir);

    expect(config.pages.propsExport).toBe('ComponentProps');
    expect(config.pages.componentNameStrategy).toBe('relative-no-ext');
    expect(config.codegen.outDir).toBe(join(tmpDir, '.nestjs-inertia'));
    expect(config.scopes).toEqual({});
    expect(config.app).toBeNull();
    // contracts defaults
    expect(config.contracts.glob).toBe('src/**/*.controller.ts');
    expect(config.contracts.debounceMs).toBe(500);
    expect(config.contracts.useStaticDiscovery).toBe(true);
  });

  it('respects user-supplied contracts config', async () => {
    await writeFile(
      join(tmpDir, 'nestjs-inertia.config.ts'),
      `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  contracts: { glob: 'app/**/*.controller.ts', debounceMs: 1000 },
};`,
    );

    const config = await loadConfig(tmpDir);

    expect(config.contracts.glob).toBe('app/**/*.controller.ts');
    expect(config.contracts.debounceMs).toBe(1000);
  });

  it('allows user to opt out of static discovery by setting useStaticDiscovery: false', async () => {
    await writeFile(
      join(tmpDir, 'nestjs-inertia.config.ts'),
      `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  contracts: { useStaticDiscovery: false },
};`,
    );

    const config = await loadConfig(tmpDir);

    expect(config.contracts.useStaticDiscovery).toBe(false);
  });
});
