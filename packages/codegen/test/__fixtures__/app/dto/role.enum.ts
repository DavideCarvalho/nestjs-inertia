// Cross-file named enum imported by a @FilterFor method param. The codegen must
// emit `import type { Role } from '<relative path to this file>'`.
export enum Role {
  Admin = 'admin',
  Member = 'member',
}

// A cross-file named type alias (literal union behind a name) — also imported.
export type Tier = 'free' | 'pro' | 'enterprise';
