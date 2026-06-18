<script lang="ts">
  import WhenVisible from '../../../src/svelte/WhenVisible.svelte';

  interface Props {
    data?: string | string[];
    buffer?: number;
    always?: boolean;
  }
  const { data = undefined, buffer = undefined, always = undefined }: Props = $props();
</script>

<WhenVisible {data} {buffer} {always}>
  <span data-testid="content">content</span>
</WhenVisible>
