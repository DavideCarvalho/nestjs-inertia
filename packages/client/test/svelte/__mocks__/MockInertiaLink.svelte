<script lang="ts">
  export let href: string = '';
</script>

<a {href} data-testid="inertia-link">
  <slot />
</a>
