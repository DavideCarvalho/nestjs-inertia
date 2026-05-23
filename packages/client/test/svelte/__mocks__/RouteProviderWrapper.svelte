<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    resolver: (name: string, params?: Record<string, unknown>, query?: Record<string, unknown>) => string;
    children?: Snippet;
  }

  const { resolver, children }: Props = $props();

  setContext('inertia-routes', resolver);
</script>

{@render children?.()}
