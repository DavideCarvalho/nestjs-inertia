import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
