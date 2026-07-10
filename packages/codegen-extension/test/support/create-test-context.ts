import { Project } from 'ts-morph';
import type { EmitContext } from '../../src/emit-context.js';

/**
 * Builds a minimal `EmitContext` — just the fields the `shared`/`pageExcludes` emitFiles
 * helpers actually read — backed by a real ts-morph `Project` over on-disk fixtures. Mirrors
 * how the host (`@dudousxd/nestjs-codegen`) constructs its lazy `project()`: no tsconfig,
 * no lib files, no cross-file dependency resolution — pure per-file AST parsing.
 */
export function createTestContext(options: {
  cwd: string;
  outDir: string;
  contractsGlob?: string;
}): EmitContext {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, strict: false },
  });

  return {
    cwd: options.cwd,
    outDir: options.outDir,
    project: () => project,
    config: {
      contracts: {
        glob: options.contractsGlob ?? 'controllers/**/*.controller.ts',
      },
    },
  };
}
