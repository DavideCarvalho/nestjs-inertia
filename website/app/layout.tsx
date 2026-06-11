import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://davidecarvalho.github.io/nestjs-inertia'),
  title: {
    default: 'nestjs-inertia',
    template: '%s — nestjs-inertia',
  },
  description:
    'Inertia.js adapter for NestJS — build server-driven React, Vue, or Svelte SPAs straight from your controllers. No API layer, typed pages, links, and props, on Express and Fastify.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
