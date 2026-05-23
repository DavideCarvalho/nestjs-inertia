import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * We import `run` directly from src/cli/main.ts and call it with a mocked cwd
 * (via process.chdir) so we don't need to compile the package first.
 * vitest.config uses pool: 'forks' so process.chdir is safe here.
 */

let tmpBase: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpBase = await mkdtemp(join(tmpdir(), 'codegen-cli-spec-'));
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpBase, { recursive: true, force: true });
});

async function setupProject(dir: string): Promise<void> {
  const pagesDir = join(dir, 'inertia', 'pages');
  await mkdir(pagesDir, { recursive: true });
  await writeFile(
    join(pagesDir, 'Foo.tsx'),
    'export type ComponentProps = { id: number };\nexport default function Foo() { return null; }\n',
    'utf8',
  );
  // Plain object export — no import needed, works from any cwd
  await writeFile(
    join(dir, 'nestjs-inertia.config.ts'),
    `export default { pages: { glob: 'inertia/pages/**/*.tsx' } };\n`,
    'utf8',
  );
}

describe('runCodegen one-shot route discovery', () => {
  it('emits routes.ts containing discovered route when project has a controller', async () => {
    // Set up a project with a controller file using the @ApplyContract pattern
    const pagesDir = join(tmpBase, 'inertia', 'pages');
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      join(pagesDir, 'Users.tsx'),
      'export type ComponentProps = { items: string[] };\nexport default function Users() { return null; }\n',
      'utf8',
    );

    const fixturesAppDir = resolve(__dirname, '../__fixtures__/app');
    const srcDir = join(tmpBase, 'src');
    await mkdir(srcDir, { recursive: true });

    // Copy the fixture contract controller so static discovery can find it
    const controllerSrc = await readFile(
      join(fixturesAppDir, 'contract-users.controller.ts'),
      'utf8',
    );
    await writeFile(join(srcDir, 'users.controller.ts'), controllerSrc, 'utf8');

    await writeFile(
      join(tmpBase, 'nestjs-inertia.config.ts'),
      `export default {
  pages: { glob: 'inertia/pages/**/*.tsx' },
  contracts: { glob: 'src/**/*.controller.ts' },
};\n`,
      'utf8',
    );

    const { runCodegen } = await import('../../src/cli/codegen.js');
    await runCodegen({ watch: false, cwd: tmpBase });

    const routesContent = await readFile(join(tmpBase, '.nestjs-inertia', 'routes.ts'), 'utf8');
    expect(routesContent).toContain('users.list');
  });
});

describe('run codegen', () => {
  it('exits with 0 and writes pages.d.ts for a valid project', async () => {
    await setupProject(tmpBase);
    process.chdir(tmpBase);

    const { run } = await import('../../src/cli/main.js');
    const code = await run(['codegen']);

    expect(code).toBe(0);

    // Assert output artifact exists
    await expect(access(join(tmpBase, '.nestjs-inertia', 'pages.d.ts'))).resolves.toBeUndefined();
  });

  it('exits with 1 when config is missing', async () => {
    // tmpBase has no config file
    process.chdir(tmpBase);

    const { run } = await import('../../src/cli/main.js');
    const code = await run(['codegen']);

    expect(code).toBe(1);
  });
});
