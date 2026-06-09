import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '../../src/config/types.js';
import { watch } from '../../src/watch/watcher.js';

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 6000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function makeConfig(cwd: string, outDir: string): ResolvedConfig {
  return {
    pages: {
      glob: '**/*.tsx',
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
    },
    contracts: { glob: 'src/**/*.controller.ts', debounceMs: 100 },
    scopes: {},
    codegen: { outDir, cwd },
    app: null,
    fetcher: null,
    forms: { enabled: true, watch: 'src/**/*.dto.ts', zodImport: 'zod' },
  };
}

const CONTROLLER = `
import { Body, Controller, Post } from '@nestjs/common';
import { RegisterDto } from './register.dto.js';

@Controller('account')
export class AccountController {
  @Post('/register')
  register(@Body() _dto: RegisterDto) {
    return { ok: true };
  }
}
`;

const dtoWith = (rule: string) => `
import { IsString } from 'class-validator';
export class RegisterDto {
  ${rule}
  email!: string;
}
`;

describe('forms watch (DTO glob)', () => {
  let tmpBase: string;
  const watchers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    for (const w of watchers) await w.close();
    watchers.length = 0;
    if (tmpBase) await rm(tmpBase, { recursive: true, force: true });
  });

  it('re-emits forms.ts when a *.dto.ts file changes', async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'forms-watch-'));
    const srcDir = join(tmpBase, 'src');
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'account.controller.ts'), CONTROLLER, 'utf8');
    await writeFile(join(srcDir, 'register.dto.ts'), dtoWith('@IsString()'), 'utf8');

    const config = makeConfig(tmpBase, outDir);
    const watcher = await watch(config);
    watchers.push(watcher);

    // Initial pass emits forms.ts with a plain string field.
    await waitForCondition(async () => {
      try {
        const f = await readFile(join(outDir, 'forms.ts'), 'utf8');
        return f.includes('email: z.string()');
      } catch {
        return false;
      }
    });

    // Change the DTO → add @MinLength → forms.ts should pick up the refinement.
    await writeFile(join(srcDir, 'register.dto.ts'), dtoWith('@IsString() @MinLength(5)'), 'utf8');

    await waitForCondition(async () => {
      try {
        const f = await readFile(join(outDir, 'forms.ts'), 'utf8');
        return f.includes('email: z.string().min(5)');
      } catch {
        return false;
      }
    });
  }, 20000);
});
