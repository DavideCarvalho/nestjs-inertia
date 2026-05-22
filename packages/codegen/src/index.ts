export const VERSION = '0.4.0-alpha.0';

export { defineConfig } from './config/define-config.js';
export { loadConfig } from './config/load-config.js';
export type { UserConfig, ResolvedConfig, ScopeConfig } from './config/types.js';
export { ConfigError, CodegenError } from './exceptions.js';
