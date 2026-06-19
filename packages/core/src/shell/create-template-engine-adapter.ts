import { createRequire } from 'node:module';
import { MissingTemplateEngineDepException } from '../errors/exceptions.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';

const require = createRequire(import.meta.url);

/**
 * Build a {@link TemplateEngineAdapter} from a lazily-`require`d engine package.
 * Single-sources the require + `MissingTemplateEngineDepException` policy and the
 * adapter wrapper that every engine repeated; each engine supplies only its
 * metadata and how to compile a template once the module is loaded. The module is
 * required on each `compile()` (Node memoizes it), exactly as the per-engine
 * adapters did, so a missing dependency surfaces lazily at render time.
 */
export function createTemplateEngineAdapter<TModule>(config: {
  extension: string;
  packageName: string;
  /** Human-readable engine name for the missing-dependency error. */
  displayName: string;
  compile: (
    mod: TModule,
    templateSource: string,
    absPath: string,
  ) => (locals: Record<string, unknown>) => string | Promise<string>;
}): TemplateEngineAdapter {
  const load = (): TModule => {
    try {
      return require(config.packageName) as TModule;
    } catch {
      throw new MissingTemplateEngineDepException(config.displayName, config.packageName);
    }
  };
  return {
    extension: config.extension,
    packageName: config.packageName,
    compile: (templateSource, absPath) => config.compile(load(), templateSource, absPath),
  };
}
