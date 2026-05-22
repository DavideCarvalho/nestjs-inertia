// website/astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://davidecarvalho.github.io',
  base: '/nestjs-inertia',
  integrations: [
    starlight({
      title: 'nestjs-inertia',
      description:
        'Inertia.js adapter for NestJS — TypeScript-first, multi-app, Tuyau-style typed client.',
      social: {
        github: 'https://github.com/DavideCarvalho/nestjs-inertia',
      },
      editLink: {
        baseUrl:
          'https://github.com/DavideCarvalho/nestjs-inertia/edit/main/website/',
      },
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Packages',
          autogenerate: { directory: 'packages' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
