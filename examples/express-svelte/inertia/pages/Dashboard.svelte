<script lang="ts">
import { Link } from '@dudousxd/nestjs-inertia-client/svelte';

export type ComponentProps = {
  user: { name: string };
  items: number;
};

const { user, items } = $props<ComponentProps>();
</script>

<main>
  <h1>Dashboard</h1>
  <p>Hi, {user.name}</p>
  <p>Items: {items}</p>
  <nav>
    <Link route="items.list">View items</Link>
  </nav>
</main>
