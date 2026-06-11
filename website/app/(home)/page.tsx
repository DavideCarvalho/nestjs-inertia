import Link from 'next/link';
import {
  ArrowRight,
  Braces,
  FlaskConical,
  Layers,
  Link2,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';

const CODEGEN_URL = 'https://davidecarvalho.github.io/nestjs-codegen';

const GITHUB_URL = 'https://github.com/DavideCarvalho/nestjs-inertia';

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <BackgroundTexture />
      <Hero />
      <InertiaShowcase />
      <CodegenShowcase />
      <FeatureGrid />
      <WireItIn />
      <FinalCta />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Background — dot grid + violet wire glow, CSS only                         */
/* -------------------------------------------------------------------------- */

function BackgroundTexture() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div
        className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgb(139 92 246 / 0.18) 0%, rgb(139 92 246 / 0.05) 40%, transparent 70%)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-20 text-center sm:pt-28">
      <div className="in-stagger flex flex-col items-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 font-mono text-xs text-fd-muted-foreground backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="animate-in-blink absolute inline-flex h-2 w-2 rounded-full bg-violet-400" />
          </span>
          Inertia.js, native to NestJS
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Server-driven SPAs,{' '}
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-400 bg-clip-text text-transparent">
            native to NestJS.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-fd-muted-foreground">
          Build React, Vue, or Svelte frontends on your NestJS monolith — no
          API to design, no client cache to sync. Pages render straight from
          your controllers, with a typed <code className="rounded bg-fd-muted px-1 py-0.5 font-mono text-base">{'<Link>'}</code>,
          page-name autocomplete, and end-to-end props along for the ride.
          Express <em>and</em> Fastify.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-violet-500 px-5 py-2.5 font-medium text-zinc-950 shadow-[0_0_24px_-6px] shadow-violet-500/50 transition-all hover:bg-violet-400 hover:shadow-violet-400/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            Install in 5 minutes
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>

        <p className="mt-6 font-mono text-xs text-fd-muted-foreground">
          5 packages on npm · `nestjs-inertia init` scaffolds everything · auto-codegen in dev
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inertia showcase — the centerpiece. The controller return flows into the    */
/*  page's props, server-driven and fully typed. No fetch, no API route.        */
/* -------------------------------------------------------------------------- */

interface CodeToken {
  text: string;
  cls?: string;
}

const CONTROLLER_LINES: readonly { tokens: CodeToken[] }[] = [
  {
    tokens: [
      { text: '@Controller', cls: 'text-violet-400' },
      { text: '(' },
      { text: "'dashboard'", cls: 'text-teal-300' },
      { text: ')' },
    ],
  },
  {
    tokens: [
      { text: 'export class ', cls: 'text-violet-400' },
      { text: 'DashboardController', cls: 'text-amber-300' },
      { text: ' {' },
    ],
  },
  {
    tokens: [
      { text: '  @Get', cls: 'text-violet-400' },
      { text: '()' },
    ],
  },
  {
    tokens: [
      { text: '  @Inertia', cls: 'text-violet-400' },
      { text: '(' },
      { text: "'Dashboard'", cls: 'text-teal-300' },
      { text: ')' },
      { text: '  // typed page name', cls: 'text-zinc-600' },
    ],
  },
  {
    tokens: [
      { text: '  getDashboard', cls: 'text-sky-400' },
      { text: '() {' },
    ],
  },
  {
    tokens: [
      { text: '    return', cls: 'text-violet-400' },
      { text: ' { user, stats };' },
      { text: '  // → the page props', cls: 'text-zinc-600' },
    ],
  },
  { tokens: [{ text: '  }' }] },
  { tokens: [{ text: '}' }] },
];

const PAGE_LINES: readonly { tokens: CodeToken[] }[] = [
  { tokens: [{ text: '// props inferred from getDashboard() — no manual types', cls: 'text-zinc-600' }] },
  {
    tokens: [
      { text: 'export default function ', cls: 'text-violet-400' },
      { text: 'Dashboard', cls: 'text-sky-400' },
      { text: '({ user, stats }: ' },
      { text: 'PageProps', cls: 'text-amber-300' },
      { text: ') {' },
    ],
  },
  {
    tokens: [
      { text: '  return', cls: 'text-violet-400' },
      { text: ' (' },
    ],
  },
  {
    tokens: [
      { text: '    <' , cls: 'text-zinc-500' },
      { text: 'section', cls: 'text-teal-300' },
      { text: '>', cls: 'text-zinc-500' },
    ],
  },
  {
    tokens: [
      { text: '      <' , cls: 'text-zinc-500' },
      { text: 'h1', cls: 'text-teal-300' },
      { text: '>', cls: 'text-zinc-500' },
      { text: 'Hi, {user.name}' },
      { text: '</' , cls: 'text-zinc-500' },
      { text: 'h1', cls: 'text-teal-300' },
      { text: '>', cls: 'text-zinc-500' },
    ],
  },
  {
    tokens: [
      { text: '      <' , cls: 'text-zinc-500' },
      { text: 'Link', cls: 'text-teal-300' },
      { text: ' href', cls: 'text-sky-400' },
      { text: '=' },
      { text: '"/settings"', cls: 'text-teal-300' },
      { text: '>Settings</' , cls: 'text-zinc-500' },
      { text: 'Link', cls: 'text-teal-300' },
      { text: '>', cls: 'text-zinc-500' },
      { text: '  // typed route', cls: 'text-zinc-600' },
    ],
  },
  {
    tokens: [
      { text: '    </' , cls: 'text-zinc-500' },
      { text: 'section', cls: 'text-teal-300' },
      { text: '>', cls: 'text-zinc-500' },
    ],
  },
  { tokens: [{ text: '  );' }] },
  { tokens: [{ text: '}' }] },
  { tokens: [{ text: '// no fetch · no useQuery · no API route', cls: 'text-zinc-600' }] },
];

function InertiaShowcase() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24">
      <div className="mb-10 text-center">
        <span className="font-mono text-xs uppercase tracking-wider text-violet-500">
          Server-driven by default
        </span>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your controller is the page.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Return an object from a controller, tag it with{' '}
          <code className="rounded bg-fd-muted px-1 py-0.5 font-mono text-sm">@Inertia</code>,
          and that data lands in your page component — fully typed, no fetch, no
          API route, no client cache to babysit. The response <em>is</em> the
          page.
        </p>
      </div>
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-violet-500/10 blur-3xl"
        />
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <CodePane
            title="dashboard.controller.ts"
            badge="server"
            badgeCls="text-sky-400"
            lines={CONTROLLER_LINES}
          />
          <CodePane
            title="inertia/pages/Dashboard.tsx"
            badge="✓ typed props"
            badgeCls="text-violet-400"
            lines={PAGE_LINES}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Codegen sibling — for clients that aren't Inertia. The same controllers     */
/*  feed @dudousxd/nestjs-codegen's fully typed API client. Cross-links out.    */
/* -------------------------------------------------------------------------- */

const BEFORE_LINES: readonly { tokens: CodeToken[] }[] = [
  { tokens: [{ text: '// manual axios hooks everywhere', cls: 'text-zinc-600' }] },
  {
    tokens: [
      { text: 'export function ', cls: 'text-violet-400' },
      { text: 'useGetCrew', cls: 'text-sky-400' },
      { text: '() {' },
    ],
  },
  {
    tokens: [
      { text: '  return ', cls: 'text-violet-400' },
      { text: 'useQuery', cls: 'text-sky-400' },
      { text: '({' },
    ],
  },
  { tokens: [{ text: "    queryKey: ['crew']," }] },
  {
    tokens: [
      { text: '    queryFn: ' },
      { text: 'async', cls: 'text-violet-400' },
      { text: ' () => {' },
    ],
  },
  {
    tokens: [
      { text: '      const { data } = await ', cls: 'text-zinc-400' },
      { text: 'axios.get', cls: 'text-sky-400' },
      { text: "('/api/v1/crew/list');" },
    ],
  },
  {
    tokens: [
      { text: '      return data ', cls: 'text-zinc-400' },
      { text: 'as', cls: 'text-violet-400' },
      { text: ' CrewResponse', cls: 'text-amber-300' },
      { text: ';' },
    ],
  },
  { tokens: [{ text: '    },' }] },
  { tokens: [{ text: '  });' }] },
  { tokens: [{ text: '}' }] },
  { tokens: [{ text: '// ...repeat for every endpoint', cls: 'text-zinc-600' }] },
];

const AFTER_LINES: readonly { tokens: CodeToken[] }[] = [
  {
    tokens: [
      { text: 'import', cls: 'text-violet-400' },
      { text: ' { api } ' },
      { text: 'from', cls: 'text-violet-400' },
      { text: " '~codegen/api'", cls: 'text-teal-300' },
      { text: ';' },
    ],
  },
  { tokens: [] },
  { tokens: [{ text: '// Queries — fully typed, zero boilerplate', cls: 'text-zinc-600' }] },
  {
    tokens: [
      { text: 'const { data } = ' },
      { text: 'useQuery', cls: 'text-sky-400' },
      { text: '(api.crew.getCrew.' },
      { text: 'queryOptions', cls: 'text-sky-400' },
      { text: '());' },
    ],
  },
  { tokens: [] },
  { tokens: [{ text: '// Mutations — body & params typed from your controller', cls: 'text-zinc-600' }] },
  {
    tokens: [
      { text: 'const update = ' },
      { text: 'useMutation', cls: 'text-sky-400' },
      { text: '(api.crew.updateCrew.' },
      { text: 'mutationOptions', cls: 'text-sky-400' },
      { text: '());' },
    ],
  },
  {
    tokens: [
      { text: 'await', cls: 'text-violet-400' },
      { text: ' update.' },
      { text: 'mutateAsync', cls: 'text-sky-400' },
      { text: "({ params: { id: '42' }, body: { name: 'New Name' } });" },
    ],
  },
  { tokens: [] },
  { tokens: [{ text: '// Cache invalidation — typed keys', cls: 'text-zinc-600' }] },
  {
    tokens: [
      { text: 'qc.' },
      { text: 'invalidateQueries', cls: 'text-sky-400' },
      { text: '({ queryKey: api.crew.getCrew.' },
      { text: 'queryKey', cls: 'text-sky-400' },
      { text: '() });' },
    ],
  },
];

function CodePane({
  title,
  badge,
  badgeCls,
  lines,
  dimmed,
}: {
  title: string;
  badge: string;
  badgeCls: string;
  lines: readonly { tokens: CodeToken[] }[];
  dimmed?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 ring-1 ring-white/5">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="ml-3 font-mono text-xs text-zinc-500">{title}</span>
        <span className={`ml-auto font-mono text-[11px] ${badgeCls}`}>{badge}</span>
      </div>
      <pre className={`overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed ${dimmed ? 'opacity-60' : ''}`}>
        <code>
          {lines.map((line, lineIndex) => (
            <div key={lineIndex} className="whitespace-pre">
              {line.tokens.map((token, tokenIndex) => (
                <span key={tokenIndex} className={token.cls ?? 'text-zinc-300'}>
                  {token.text}
                </span>
              ))}
              {line.tokens.length === 0 ? ' ' : null}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CodegenShowcase() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24">
      <div className="mb-10 text-center">
        <span className="font-mono text-xs uppercase tracking-wider text-fd-muted-foreground">
          The codegen sibling
        </span>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Got consumers that aren&apos;t Inertia?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Inertia covers your own frontend. For mobile apps, third parties, or
          anything that calls your NestJS API directly, its sibling{' '}
          <code className="rounded bg-fd-muted px-1 py-0.5 font-mono text-sm">@dudousxd/nestjs-codegen</code>{' '}
          generates a fully typed client from the same controllers — TanStack
          Query options, typed params and bodies, the works.
        </p>
      </div>
      <div className="relative">
        {/* glow halo under the panes */}
        <div
          aria-hidden
          className="absolute -inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-violet-500/10 blur-3xl"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <CodePane
            title="hooks/useCrew.ts"
            badge="✗ before"
            badgeCls="text-zinc-500"
            lines={BEFORE_LINES}
            dimmed
          />
          <CodePane
            title="PostList.tsx"
            badge="✓ nestjs-codegen"
            badgeCls="text-violet-400"
            lines={AFTER_LINES}
          />
        </div>
      </div>
      <div className="mt-8 flex justify-center">
        <a
          href={CODEGEN_URL}
          className="group inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
        >
          Explore nestjs-codegen
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature grid                                                                */
/* -------------------------------------------------------------------------- */

interface Feature {
  icon: typeof Braces;
  title: string;
  body: string;
  accent: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: Server,
    title: 'Server-driven, no API',
    body: 'Controllers return page props; Inertia ships them with the page render. No REST or GraphQL layer to design, version, or keep in sync — and no client data cache to invalidate.',
    accent: 'text-violet-400',
  },
  {
    icon: Link2,
    title: 'Typed <Link>',
    body: 'Route names autocompleted from your controllers. routeParams required and typed to the exact params. Wrong route or missing param? Compile-time error.',
    accent: 'text-sky-400',
  },
  {
    icon: Braces,
    title: 'Type-safe page names',
    body: "The codegen scans inertia/pages/ and augments @Inertia() to only accept pages that exist. A typo like 'Dashbord' fails the build — not the user.",
    accent: 'text-fuchsia-400',
  },
  {
    icon: ShieldCheck,
    title: 'Props E2E',
    body: 'req.inertia.render() knows what each page expects — props inferred straight from the default export of every page component. Wrong props never ship.',
    accent: 'text-emerald-400',
  },
  {
    icon: Layers,
    title: 'React, Vue, or Svelte',
    body: 'One adapter, three frameworks, full Inertia protocol parity: partial reloads, deferred props, history encryption, error bags — on Express and Fastify.',
    accent: 'text-amber-400',
  },
  {
    icon: FlaskConical,
    title: 'First-class testing',
    body: 'expectInertia() matchers assert the rendered page, props, and redirects in supertest e2e suites — without booting a browser.',
    accent: 'text-teal-400',
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The monolith, with a typed wire
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Six guarantees, one mental model. Everything between your NestJS
          controllers and your pages is generated and type-checked.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-fd-border bg-fd-card/50 p-5 backdrop-blur transition-colors hover:border-violet-500/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120px circle at top right, rgb(139 92 246 / 0.1), transparent 70%)',
        }}
      />
      <div className="relative">
        <span className="inline-flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-background/60">
          <Icon className={`size-4.5 ${feature.accent}`} />
        </span>
        <h3 className="mt-4 font-medium">{feature.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
          {feature.body}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wire it in — init command with window chrome                               */
/* -------------------------------------------------------------------------- */

const INIT_LINES: readonly { tokens: CodeToken[] }[] = [
  {
    tokens: [
      { text: '$ ', cls: 'text-zinc-600' },
      { text: 'pnpm add ', cls: 'text-zinc-300' },
      { text: '@dudousxd/nestjs-inertia \\', cls: 'text-violet-400' },
    ],
  },
  {
    tokens: [
      { text: '    ' },
      { text: '@dudousxd/nestjs-inertia-vite ', cls: 'text-violet-400' },
      { text: '@dudousxd/nestjs-inertia-client', cls: 'text-violet-400' },
    ],
  },
  { tokens: [] },
  {
    tokens: [
      { text: '$ ', cls: 'text-zinc-600' },
      { text: 'npx nestjs-inertia init', cls: 'text-zinc-300' },
    ],
  },
  { tokens: [] },
  {
    tokens: [
      { text: '✓', cls: 'text-emerald-400' },
      { text: ' inertia/ scaffolded (pages, app shell, vite entry)', cls: 'text-zinc-500' },
    ],
  },
  {
    tokens: [
      { text: '✓', cls: 'text-emerald-400' },
      { text: ' app.module.ts patched — InertiaModule.forRoot()', cls: 'text-zinc-500' },
    ],
  },
  {
    tokens: [
      { text: '✓', cls: 'text-emerald-400' },
      { text: ' main.ts patched — setupInertiaVite()', cls: 'text-zinc-500' },
    ],
  },
  {
    tokens: [
      { text: '✓', cls: 'text-emerald-400' },
      { text: ' nestjs-inertia.config.ts created — auto-codegen on dev boot', cls: 'text-zinc-500' },
    ],
  },
];

function WireItIn() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-violet-500">
            Wire it in
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            One command. That&apos;s the install.
          </h2>
          <p className="mt-4 text-fd-muted-foreground">
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">nestjs-inertia init</code>{' '}
            scaffolds the <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">inertia/</code>{' '}
            directory and auto-patches your existing{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">app.module.ts</code> and{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">main.ts</code>. From then on,{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">nest start --watch</code> is
            the only dev command you need — codegen watches alongside it.
          </p>
          <Link
            href="/docs/getting-started"
            className="mt-6 inline-flex items-center gap-2 font-medium text-violet-500 transition-colors hover:text-violet-400"
          >
            Full setup guide
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/30 ring-1 ring-white/5">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
            <Terminal className="size-3.5 text-zinc-500" />
            <span className="font-mono text-xs text-zinc-500">terminal</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>
              {INIT_LINES.map((line, lineIndex) => (
                <div key={lineIndex} className="whitespace-pre">
                  {line.tokens.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      className={token.cls ?? 'text-zinc-300'}
                    >
                      {token.text}
                    </span>
                  ))}
                  {line.tokens.length === 0 ? ' ' : null}
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                   */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-28">
      <div className="relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card/60 px-6 py-14 text-center backdrop-blur">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 100% at 50% 0%, rgb(139 92 246 / 0.14), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4]"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
          }}
        />
        <span className="inline-flex items-center gap-2 font-mono text-xs text-violet-500">
          <Sparkles className="size-4" />
          <Braces className="size-4" />
          <ShieldCheck className="size-4" />
        </span>
        <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Ship pages, not endpoints.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-fd-muted-foreground">
          Install, run init, and build server-driven SPAs on NestJS — React,
          Vue, or Svelte, with the compiler watching your pages, links, and
          props.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-violet-500 px-6 py-2.5 font-medium text-zinc-950 shadow-[0_0_24px_-6px] shadow-violet-500/50 transition-all hover:bg-violet-400 hover:shadow-violet-400/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-background/40 px-6 py-2.5 font-medium transition-colors hover:bg-fd-accent"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
