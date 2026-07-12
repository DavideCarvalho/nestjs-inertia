import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyInitPlan, detectFramework, nextStepsText, planInit, renderInitPlan } from './init';
import { memoryTree } from './tree';

function action(plan: ReturnType<typeof planInit>, path: string) {
  const match = plan.actions.find((candidate) => candidate.path === path);
  if (!match) throw new Error(`no action for ${path}`);
  return match;
}

describe('detectFramework', () => {
  it('detects react from @inertiajs/react', () => {
    const tree = memoryTree({
      'package.json': JSON.stringify({ dependencies: { '@inertiajs/react': '3.0.0' } }),
    });
    expect(detectFramework(tree)).toBe('react');
  });

  it('detects vue from a plain vue dependency', () => {
    const tree = memoryTree({ 'package.json': JSON.stringify({ dependencies: { vue: '3.4.0' } }) });
    expect(detectFramework(tree)).toBe('vue');
  });

  it('returns null when nothing matches', () => {
    expect(detectFramework(memoryTree({}))).toBeNull();
  });
});

describe('planInit', () => {
  it('plans every scaffold file on an empty project', () => {
    const plan = planInit(memoryTree({}));
    expect(plan.framework).toBe('react');
    expect(plan.frameworkDetected).toBe(false);
    const created = plan.actions.filter((a) => a.kind === 'create').map((a) => a.path);
    expect(created).toEqual([
      'nestjs-codegen.config.ts',
      'nestjs-inertia.d.ts',
      'inertia/index.html',
      'inertia/app.tsx',
      'vite.config.ts',
      '.gitignore',
    ]);
  });

  it('never clobbers existing files without --force', () => {
    const tree = memoryTree({ 'inertia/index.html': '<html>mine</html>' });
    const plan = planInit(tree);
    expect(action(plan, 'inertia/index.html').kind).toBe('skip');
  });

  it('overwrites existing files with --force', () => {
    const tree = memoryTree({ 'inertia/index.html': '<html>mine</html>' });
    const plan = planInit(tree, { force: true });
    const shell = action(plan, 'inertia/index.html');
    expect(shell.kind).toBe('overwrite');
    expect(shell.contents).toContain('@inertia');
  });

  it('appends .nestjs-inertia/ to an existing .gitignore', () => {
    const plan = planInit(memoryTree({ '.gitignore': 'node_modules' }));
    const gitignore = action(plan, '.gitignore');
    expect(gitignore.kind).toBe('append');
    expect(gitignore.contents).toBe('node_modules\n.nestjs-inertia/\n');
  });

  it('is idempotent when .gitignore already has the entry', () => {
    const plan = planInit(memoryTree({ '.gitignore': '.nestjs-inertia/\n' }));
    expect(action(plan, '.gitignore').kind).toBe('skip');
  });

  it('uses vue templates when vue is detected', () => {
    const tree = memoryTree({ 'package.json': JSON.stringify({ dependencies: { vue: '3.4.0' } }) });
    const plan = planInit(tree);
    expect(plan.framework).toBe('vue');
    expect(action(plan, 'inertia/app.ts').contents).toContain('@inertiajs/vue3');
    expect(action(plan, 'nestjs-codegen.config.ts').contents).toContain('inertia/pages/**/*.vue');
  });

  it('honors an explicit framework override', () => {
    const plan = planInit(memoryTree({}), { framework: 'svelte' });
    expect(action(plan, 'inertia/app.ts').contents).toContain('@inertiajs/svelte');
  });

  it('scaffolds the shared codegen config with the extension and drift note', () => {
    const contents = action(planInit(memoryTree({})), 'nestjs-codegen.config.ts').contents ?? '';
    expect(contents).toContain('nestjsInertiaCodegen()');
    expect(contents).toContain('NestjsCodegenModule.forRoot(codegenConfig)');
    expect(contents).toContain("outDir: '.nestjs-inertia'");
  });
});

describe('renderInitPlan', () => {
  it('shows would-write lines in dry-run mode', () => {
    const out = renderInitPlan(planInit(memoryTree({})), true);
    expect(out).toContain('--dry-run');
    expect(out).toMatch(/would be created/);
    expect(out).toContain('inertia/index.html');
  });

  it('marks skipped files with the force hint', () => {
    const out = renderInitPlan(planInit(memoryTree({ 'vite.config.ts': 'mine' })), false);
    expect(out).toMatch(/vite\.config\.ts.*--force/);
  });
});

describe('nextStepsText', () => {
  it('includes the module registration snippet with codegen disabled', () => {
    const text = nextStepsText('react');
    expect(text).toContain('InertiaModule.forRoot');
    expect(text).toContain('codegen: { enabled: false }');
    expect(text).toContain('setupInertiaVite');
    expect(text).toContain('nestjs-inertia doctor');
  });
});

describe('applyInitPlan', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes planned files to disk, creating directories', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'nestjs-inertia-cli-'));
    dirs.push(cwd);
    applyInitPlan(planInit(memoryTree({})), cwd);
    expect(readFileSync(join(cwd, 'inertia/index.html'), 'utf8')).toContain('@inertia');
    expect(readFileSync(join(cwd, 'nestjs-codegen.config.ts'), 'utf8')).toContain(
      'nestjsInertiaCodegen',
    );
    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toContain('.nestjs-inertia/');
  });
});

describe('init + doctor round-trip', () => {
  it('the scaffolded files do not trip any doctor check they participate in', async () => {
    const { runDoctorChecks } = await import('./doctor');
    const plan = planInit(memoryTree({}));
    const files: Record<string, string> = {};
    for (const planned of plan.actions) {
      if (planned.contents !== undefined) files[planned.path] = planned.contents;
    }
    const results = runDoctorChecks(memoryTree(files));
    const scaffoldChecks = results.filter(
      (result) =>
        result.name.includes('flat shape') ||
        result.name.includes('Root view shell') ||
        result.name.includes('Vite entry') ||
        result.name.includes('nestInertia plugin') ||
        result.name.includes('registers nestjsInertiaCodegen') ||
        result.name.includes('.gitignore includes'),
    );
    expect(scaffoldChecks.filter((result) => result.status !== 'pass')).toEqual([]);
  });
});
