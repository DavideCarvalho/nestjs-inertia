import starlight from '@astrojs/starlight';
// website/astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://davidecarvalho.github.io',
  base: '/nestjs-inertia',
  integrations: [
    starlight({
      title: 'nestjs-inertia',
      description:
        'Inertia.js adapter for NestJS — TypeScript-first, multi-app, Tuyau-style typed client.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/DavideCarvalho/nestjs-inertia' },
      ],
      editLink: {
        baseUrl: 'https://github.com/DavideCarvalho/nestjs-inertia/edit/main/website/',
      },
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Packages',
          items: [{ autogenerate: { directory: 'packages' } }],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
});
