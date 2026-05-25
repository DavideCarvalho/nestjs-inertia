export const VERSION = '1.6.0';

export { defineConfig } from './config/define-config.js';
export { loadConfig } from './config/load-config.js';
export type { UserConfig, ResolvedConfig, ScopeConfig } from './config/types.js';
export { ConfigError, CodegenError } from './exceptions.js';

export { generate } from './generate.js';
export { watch } from './watch/watcher.js';
export type { Watcher } from './watch/watcher.js';
export { acquireLock } from './watch/lock-file.js';
