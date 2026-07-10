import type { ExtensionContext } from '@dudousxd/nestjs-codegen/extension';

/**
 * The subset of the host's `ExtensionContext` that `emitFiles` helpers in this package
 * actually read. Deliberately narrower than the full contract — `ResolvedConfig` carries
 * fields (validation adapter, scopes, pages, forms, ...) this extension never touches, and
 * requiring a full `ExtensionContext` in helper signatures would force tests to stub all of
 * them. Every real `ExtensionContext` the host passes in satisfies this structurally, so no
 * cast is needed at the call site in `index.ts`.
 */
export type EmitContext = {
  cwd: ExtensionContext['cwd'];
  outDir: ExtensionContext['outDir'];
  project: ExtensionContext['project'];
  config: {
    contracts: {
      glob: ExtensionContext['config']['contracts']['glob'];
    };
  };
};
