<script lang="ts">
  import Deferred from '../../../src/svelte/Deferred.svelte';

  interface Props {
    data: string | string[];
  }
  const { data }: Props = $props();
</script>

<Deferred {data}>
  {#snippet fallback()}<span data-testid="fallback">loading</span>{/snippet}
  <span data-testid="content">content</span>
</Deferred>
