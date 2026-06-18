import type { InertiaPages } from '@dudousxd/nestjs-inertia';
import type { SvelteComponent } from 'svelte';
import type { DeferredProps } from './deferred-types.js';

export default class Deferred<
  K extends keyof InertiaPages | unknown = unknown,
> extends SvelteComponent<DeferredProps<K>> {}
