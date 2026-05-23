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

  // S-2: tsconfig path jail (closes H-4 escape)
  describe('S-2: tsconfig path jail', () => {
    it('accepts tsconfig inside cwd', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: 'src/app.module.ts', tsconfig: 'tsconfig.json' },
};`,
      );

      const config = await loadConfig(tmpDir);
      expect(config.app?.tsconfig).toContain('tsconfig.json');
    });

    it('throws ConfigError when tsconfig traverses above cwd via ..', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: 'src/app.module.ts', tsconfig: '../../etc/tsconfig.json' },
};`,
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError);
    });

    it('throws ConfigError when tsconfig is an absolute path outside cwd', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: 'src/app.module.ts', tsconfig: '/etc/tsconfig.json' },
};`,
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError);
    });
  });

  // H-4: moduleEntry path jail
  describe('H-4: moduleEntry path jail', () => {
    it('accepts moduleEntry inside cwd', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: 'src/app.module.ts' },
};`,
      );

      const config = await loadConfig(tmpDir);
      expect(config.app?.moduleEntry).toContain('src/app.module.ts');
    });

    it('throws ConfigError when moduleEntry traverses above cwd via ..', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: '../../etc/passwd' },
};`,
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError);
    });

    it('throws ConfigError when moduleEntry is an absolute path outside cwd', async () => {
      await writeFile(
        join(tmpDir, 'nestjs-inertia.config.ts'),
        `export default {
  pages: { glob: 'src/pages/**/*.vue' },
  app: { moduleEntry: '/etc/passwd' },
};`,
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError);
    });
  });
});
