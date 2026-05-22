import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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
  });
});
