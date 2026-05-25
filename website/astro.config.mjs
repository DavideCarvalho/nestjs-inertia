import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
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
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/DavideCarvalho/nestjs-inertia',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/DavideCarvalho/nestjs-inertia/edit/main/website/',
      },
      customCss: ['./src/styles/global.css'],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Recipes',
          items: [{ autogenerate: { directory: 'recipes' } }],
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
  vite: {
    plugins: [tailwindcss()],
  },
});
