<script setup lang="ts">
import { Link } from '@dudousxd/nestjs-inertia-client/vue';

export type ComponentProps = {
  user: { name: string };
  posts: number;
};

const props = defineProps<ComponentProps>();
</script>

<template>
  <main>
    <h1>Dashboard</h1>
    <p>Hi, {{ props.user.name }}</p>
    <p>Posts: {{ props.posts }}</p>
    <nav>
      <Link route="posts.list">View posts</Link>
    </nav>
  </main>
</template>
