<!--
  Typed wrapper over @inertiajs/svelte's <WhenVisible>.

  Mirrors the official component verbatim at runtime (the `children` and
  `fallback` snippets are forwarded through); `data` is keyed by the page's prop
  names when the page key is supplied as the `K` generic.
-->
<script lang="ts" generics="K extends keyof import('@dudousxd/nestjs-inertia').InertiaPages | unknown = unknown">
  import { WhenVisible as InertiaWhenVisible } from '@inertiajs/svelte';
  import type { WhenVisibleProps } from './deferred-types.js';

  const {
    data = undefined,
    params = undefined,
    buffer = undefined,
    as = undefined,
    always = undefined,
    children = undefined,
    fallback = undefined,
  }: WhenVisibleProps<K> = $props();

  // Forward only the props that were actually provided so the official
  // component's own defaults (buffer=0, as='div', always=false) still apply.
  const forwarded = $derived({
    ...(data !== undefined ? { data: data as string | string[] } : {}),
    ...(params !== undefined ? { params } : {}),
    ...(buffer !== undefined ? { buffer } : {}),
    ...(as !== undefined ? { as } : {}),
    ...(always !== undefined ? { always } : {}),
  });
</script>

<InertiaWhenVisible {...forwarded} {children} {fallback} />
