import type { InertiaPages } from '@dudousxd/nestjs-inertia';
import type { SvelteComponent } from 'svelte';
import type { WhenVisibleProps } from './deferred-types.js';

export default class WhenVisible<
  K extends keyof InertiaPages | unknown = unknown,
> extends SvelteComponent<WhenVisibleProps<K>> {}
