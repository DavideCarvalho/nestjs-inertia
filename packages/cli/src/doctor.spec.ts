import { describe, expect, it } from 'vitest';
import { type CheckResult, runDoctorChecks } from './doctor';
import { memoryTree } from './tree';

function pkg(name: string, version: string): Record<string, string> {
  return { [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }) };
}

const HEALTHY_MODULE = `
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { NestjsCodegenModule } from '@dudousxd/nestjs-codegen/nest';
import { codegenConfig } from '../nestjs-codegen.config';
@Module({
  imports: [
    InertiaModule.forRoot({ rootView: 'inertia/index.html', codegen: { enabled: false } }),
    NestjsCodegenModule.forRoot({ ...codegenConfig, extensions: [nestjsInertiaCodegen()] }),
  ],
})
export class AppModule {}
`;

const HEALTHY_CONFIG = `
import { defineConfig } from '@dudousxd/nestjs-codegen';
import { nestjsInertiaCodegen } from '@dudousxd/nestjs-inertia-codegen-extension';
export default defineConfig({ extensions: [nestjsInertiaCodegen()] });
`;

function healthyTree(overrides: Record<string, string> = {}) {
  return memoryTree({
    'package.json': JSON.stringify({ dependencies: { '@inertiajs/react': '3.0.0' } }),
    'src/app.module.ts': HEALTHY_MODULE,
    'nestjs-codegen.config.ts': HEALTHY_CONFIG,
    'inertia/index.html': '@inertia @inertiaHead',
    'inertia/app.tsx': 'createInertiaApp',
    'vite.config.ts': "import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';",
    '.gitignore': '.nestjs-inertia/\n',
    'nestjs-inertia.d.ts': 'export {};\n',
    ...pkg('@dudousxd/nestjs-inertia', '1.8.1'),
    ...pkg('@dudousxd/nestjs-codegen', '0.4.0'),
    ...pkg('@dudousxd/nestjs-inertia-codegen-extension', '1.1.0'),
    ...pkg('@inertiajs/react', '3.0.0'),
    ...overrides,
  });
}

function byName(results: CheckResult[], fragment: string): CheckResult {
  const match = results.find((result) => result.name.includes(fragment));
  if (!match) throw new Error(`no check matching "${fragment}"`);
  return match;
}

describe('runDoctorChecks', () => {
  it('passes every check on a healthy project', () => {
    const results = runDoctorChecks(healthyTree());
    expect(results.filter((r) => r.status !== 'pass')).toEqual([]);
  });

  it('fails when the core package is not installed', () => {
    const results = runDoctorChecks(memoryTree({}));
    const check = byName(results, '@dudousxd/nestjs-inertia installed');
    expect(check.status).toBe('fail');
    expect(check.fix).toMatch(/guides\/installation/);
  });

  it('warns below 1.4.4 (streaming-response fix)', () => {
    const results = runDoctorChecks(healthyTree(pkg('@dudousxd/nestjs-inertia', '1.4.3')));
    const check = byName(results, '>= 1.4.4');
    expect(check.status).toBe('warn');
    expect(check.fix).toMatch(/streaming/i);
  });

  it('passes the version check at exactly 1.4.4', () => {
    const results = runDoctorChecks(healthyTree(pkg('@dudousxd/nestjs-inertia', '1.4.4')));
    expect(byName(results, '>= 1.4.4').status).toBe('pass');
  });

  it('fails when InertiaModule is not registered', () => {
    const results = runDoctorChecks(
      healthyTree({ 'src/app.module.ts': 'export class AppModule {}' }),
    );
    const check = byName(results, 'InertiaModule registered');
    expect(check.status).toBe('fail');
    expect(check.fix).toMatch(/getting-started/);
  });

  it('resolves the module entry from the codegen config', () => {
    const results = runDoctorChecks(
      healthyTree({
        'nestjs-codegen.config.ts': `${HEALTHY_CONFIG}\n// moduleEntry: './apps/web/src/app.module.ts'`,
        'apps/web/src/app.module.ts': HEALTHY_MODULE,
      }),
    );
    expect(byName(results, 'apps/web/src/app.module.ts').status).toBe('pass');
  });

  it('warns when the legacy auto-watch is not disabled', () => {
    const moduleSource = HEALTHY_MODULE.replace(', codegen: { enabled: false }', '');
    const results = runDoctorChecks(healthyTree({ 'src/app.module.ts': moduleSource }));
    const check = byName(results, 'auto-watch disabled');
    expect(check.status).toBe('warn');
    expect(check.fix).toMatch(/codegen#auto-watch/);
  });

  it('fails when no codegen entrypoint is configured', () => {
    const results = runDoctorChecks(
      memoryTree({
        'src/app.module.ts': 'InertiaModule.forRoot({ codegen: { enabled: false } })',
        ...pkg('@dudousxd/nestjs-inertia', '1.8.1'),
      }),
    );
    expect(byName(results, 'Codegen configured').status).toBe('fail');
  });

  it('warns on CLI/module extension drift', () => {
    const moduleWithoutExtension = HEALTHY_MODULE.replace(
      'extensions: [nestjsInertiaCodegen()]',
      'extensions: []',
    );
    const results = runDoctorChecks(healthyTree({ 'src/app.module.ts': moduleWithoutExtension }));
    const check = byName(results, 'no drift');
    expect(check.status).toBe('warn');
    expect(check.fix).toMatch(/ONE shared config/);
  });

  it('warns when the config file omits nestjsInertiaCodegen()', () => {
    const results = runDoctorChecks(
      healthyTree({ 'nestjs-codegen.config.ts': 'export default defineConfig({});' }),
    );
    expect(byName(results, 'registers nestjsInertiaCodegen').status).toBe('warn');
  });

  it('fails when the root view shell is missing', () => {
    const results = runDoctorChecks(
      memoryTree({
        'inertia/app.tsx': 'createInertiaApp',
        ...pkg('@dudousxd/nestjs-inertia', '1.8.1'),
      }),
    );
    expect(byName(results, 'Root view shell').status).toBe('fail');
  });

  it('warns when dist/ exists without a Vite client manifest', () => {
    const results = runDoctorChecks(healthyTree({ 'dist/main.js': '' }));
    const check = byName(results, 'Vite client manifest');
    expect(check.status).toBe('warn');
    expect(check.fix).toMatch(/build:client/);
  });

  it('passes when the Vite manifest exists post-build', () => {
    const results = runDoctorChecks(
      healthyTree({ 'dist/main.js': '', 'dist/inertia/client/.vite/manifest.json': '{}' }),
    );
    expect(byName(results, 'Vite client manifest').status).toBe('pass');
  });

  it('warns on the legacy nested InertiaRegistry.pages shape', () => {
    const results = runDoctorChecks(
      healthyTree({
        'nestjs-inertia.d.ts':
          "declare module '@dudousxd/nestjs-inertia' { interface InertiaRegistry { pages: { Home: {} } } }",
      }),
    );
    const check = byName(results, 'flat shape');
    expect(check.status).toBe('warn');
    expect(check.fix).toMatch(/InertiaPages/);
  });

  it('accepts the current flat InertiaPages shape', () => {
    const results = runDoctorChecks(
      healthyTree({
        '.nestjs-inertia/pages.d.ts':
          "declare module '@dudousxd/nestjs-inertia' { interface InertiaPages { Home: {} } }",
      }),
    );
    expect(byName(results, 'flat shape').status).toBe('pass');
  });

  it('fails when the extension is installed without @dudousxd/nestjs-codegen', () => {
    const results = runDoctorChecks(
      memoryTree({
        ...pkg('@dudousxd/nestjs-inertia', '1.8.1'),
        ...pkg('@dudousxd/nestjs-inertia-codegen-extension', '1.1.0'),
      }),
    );
    expect(byName(results, 'installed alongside the codegen extension').status).toBe('fail');
  });

  it('warns when the legacy codegen package is still installed', () => {
    const results = runDoctorChecks(healthyTree(pkg('@dudousxd/nestjs-inertia-codegen', '0.9.0')));
    expect(byName(results, 'Legacy @dudousxd/nestjs-inertia-codegen').status).toBe('warn');
  });

  it('warns when the Inertia adapter is older than v3', () => {
    const results = runDoctorChecks(healthyTree(pkg('@inertiajs/react', '2.1.0')));
    expect(byName(results, '@inertiajs/react is v3+').status).toBe('warn');
  });

  it('warns when .gitignore misses .nestjs-inertia/', () => {
    const results = runDoctorChecks(healthyTree({ '.gitignore': 'node_modules\n' }));
    expect(byName(results, '.gitignore includes').status).toBe('warn');
  });
});
