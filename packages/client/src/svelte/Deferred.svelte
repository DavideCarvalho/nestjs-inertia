<!--
  Typed wrapper over @inertiajs/svelte's <Deferred>.

  Mirrors the official component verbatim at runtime (the `children`, `fallback`,
  and `rescue` snippets are forwarded through); the only addition is that `data`
  is keyed by the page's prop names when codegen has augmented `InertiaPages`.
  Bind the page key via the `K` generic:

    <Deferred data="stats">
      {#snippet fallback()}Loading…{/snippet}
      <Stats />
    </Deferred>
-->
<script lang="ts" generics="K extends keyof import('@dudousxd/nestjs-inertia').InertiaPages | unknown = unknown">
  import { Deferred as InertiaDeferred } from '@inertiajs/svelte';
  import type { DeferredProps } from './deferred-types.js';

  const {
    data,
    rescue = undefined,
    fallback = undefined,
    children = undefined,
  }: DeferredProps<K> = $props();
</script>

<InertiaDeferred data={data as string | string[]} {rescue} {fallback} {children} />
