<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    data: string | string[];
    rescue?: Snippet<[{ reloading: boolean }]>;
    fallback?: Snippet;
    children?: Snippet<[{ reloading: boolean }]>;
  }

  const { data, fallback = undefined, children = undefined }: Props = $props();
</script>

<div data-testid="deferred" data-keys={JSON.stringify(data)}>
  {#if children}{@render children({ reloading: false })}{/if}
  {#if fallback}{@render fallback()}{/if}
</div>
