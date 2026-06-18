<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    data?: string | string[];
    params?: Record<string, unknown>;
    buffer?: number;
    as?: string;
    always?: boolean;
    children?: Snippet<[{ fetching: boolean }]>;
    fallback?: Snippet;
  }

  const {
    data = undefined,
    buffer = undefined,
    always = undefined,
    children = undefined,
  }: Props = $props();
</script>

<div
  data-testid="when-visible"
  data-keys={JSON.stringify(data)}
  data-buffer={buffer === undefined ? 'unset' : String(buffer)}
  data-always={always === undefined ? 'unset' : String(always)}
>
  {#if children}{@render children({ fetching: false })}{/if}
</div>
