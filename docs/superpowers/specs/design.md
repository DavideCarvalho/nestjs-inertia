# nestjs-inertia — Design Spec

**Status:** Draft (aprovado em brainstorming, aguarda implementation plan)
**Data:** 2026-05-22
**Autor:** Davi (`davi@goflip.ai` / `github.com/DavideCarvalho`)
**Origem:** extração da integração Inertia em `~/goflipai/navy-nestjs/src/inertia/` pra biblioteca pública mantida.

---

## 1. Resumo executivo

Biblioteca NestJS pra Inertia.js v2. Norte de qualidade: o adapter oficial `@adonisjs/inertia`. Comparada à concorrência:

- **Vs `@adonisjs/inertia`**: paridade em features + supera em testing helpers, codegen tipado, multi-app, suporte Fastify e client Tuyau-style.
- **Vs Laravel adapter**: paridade + diferencial em TypeScript-first (codegen de pages e rotas typed).
- **Vs `inertia-nestjs` (npm existente, abandonado)**: substitui — protocolo completo Inertia v2, manutenção ativa.

Distribuída como **monorepo pnpm** com cinco pacotes sob o scope npm `@dudousxd/...` e repositório em `github.com/DavideCarvalho/nestjs-inertia`. Licença MIT.

## 2. Decisões de produto

| # | Decisão | Justificativa |
|---|---|---|
| 2.1 | Intenção: lib pública mantida, adoção comunitária | Confirmado pelo autor; sem ambição inicial de scope oficial `@inertiajs/*` (caminho aberto futuramente). |
| 2.2 | Versão alvo do protocolo Inertia: **v2** | Ambos Adonis e Laravel adapters migraram pra v2 (`optional()`, `defer()`, `merge()`, `always()`); nascer em v2 evita débito imediato. `lazy()` exposto apenas como alias de compat. |
| 2.3 | Escopo da v1: ambicioso (paridade total + diferenciadores Nest) | Confirmado pelo autor: prefere alongar timeline (~8 semanas) pra entregar com qualidade do `@adonisjs/inertia`. |
| 2.4 | Estrutura: monorepo pnpm com sub-pacotes | Releases coordenados via Changesets, examples consumem via workspace link. |
| 2.5 | Repo: `github.com/DavideCarvalho/nestjs-inertia` | Conta pessoal do autor. |
| 2.6 | npm scope: `@dudousxd/...` | Conta pessoal do autor. |
| 2.7 | Licença: MIT | Idêntica a `@adonisjs/inertia`, Laravel adapter, NestJS core. |

## 3. Estrutura do monorepo

```
nestjs-inertia/
├── packages/
│   ├── core/                  → @dudousxd/nestjs-inertia
│   ├── testing/               → @dudousxd/nestjs-inertia-testing
│   ├── codegen/               → @dudousxd/nestjs-inertia-codegen
│   ├── vite/                  → @dudousxd/nestjs-inertia-vite
│   └── client/                → @dudousxd/nestjs-inertia-client  (Tuyau-style + TanStack Query)
├── examples/
│   ├── express-react/         → demo Express + React + SSR
│   ├── fastify-vue/           → demo Fastify + Vue 3
│   └── monorepo-multi-app/    → demo de multi-app via forFeature
├── docs/                      → Astro Starlight site
├── .github/workflows/
│   ├── ci.yml
│   ├── release.yml
│   ├── docs.yml
│   └── examples.yml
├── .changeset/
├── turbo.json
├── biome.json
├── pnpm-workspace.yaml
└── package.json
```

**Tooling:** pnpm 9, Turborepo (cache build), Biome (lint+format), Vitest (testes), Changesets (release), Typedoc (API docs auto-gerado).

**Dependências entre pacotes (peer):**
- `core` → `@nestjs/common >=10`, `@nestjs/core >=10` (peer), tipos Express/Fastify (peer opcionais).
- `testing` → `core` (peer), `@nestjs/testing >=10` (peer).
- `codegen` → `typescript >=5` (peer); ferramenta CLI, não roda em runtime do app.
- `vite` → `vite >=5` (peer), `core` (peer opcional pra integração watch).
- `client` → `@tanstack/query-core >=5` (peer), `core` (peer), `codegen` (peer opcional).

**Engines:** todos os pacotes pinned em `"node": ">=20"` (LTS atual). NestJS 10 e 11 ambos suportados — o Navy roda 11; a lib testa nos dois pra evitar quebrar projetos legacy.

## 4. API pública do core (`@dudousxd/nestjs-inertia`)

### 4.1 Bootstrap síncrono

```ts
InertiaModule.forRoot({
  rootView: 'inertia/root.html',
  vite: {
    entry: 'app/client.tsx',
    manifestPath: 'dist/inertia/client/.vite/manifest.json',
  },
  ssr: {
    enabled: process.env.NODE_ENV === 'production',
    bundlePath: 'dist/inertia/ssr/ssr.mjs',
    devMode: 'off',           // 'off' | 'vite'
    throwOnError: false,
  },
  share: async (req) => ({
    auth: req.user ? { id: req.user.id, name: req.user.name } : null,
    flash: req.session?.flash ?? {},
  }),
  historyEncryption: { default: false },
  autoUpgrade303: true,        // 302 → 303 em PUT/PATCH/DELETE
  methodSpoofing: true,        // _method=put em POST multipart
  codegen: {
    enabled: process.env.NODE_ENV !== 'production',
    configFile: 'nestjs-inertia.config.ts',
    debounceMs: 100,
  },
});
```

### 4.2 Bootstrap assíncrono (pattern Nest padrão)

```ts
export interface InertiaOptionsFactory {
  createInertiaOptions(): Promise<InertiaModuleOptions> | InertiaModuleOptions;
}

export interface InertiaModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useExisting?: Type<InertiaOptionsFactory>;
  useClass?: Type<InertiaOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<InertiaModuleOptions> | InertiaModuleOptions;
}
```

Quatro caminhos suportados (`forRoot`, `useFactory`, `useClass`, `useExisting`). `forRoot()` e `forRootAsync()` retornam o mesmo `DynamicModule` — apenas o provider de options muda. Token de injeção: `INERTIA_MODULE_OPTIONS`.

### 4.3 Multi-app via `forFeature` / `forFeatureAsync`

```ts
InertiaModule.forFeature({
  scope: 'admin',
  rootView: 'inertia/admin/root.html',
  vite: { entry: 'admin/client.tsx' },
  share: async (req) => ({ admin: req.adminContext }),
});
```

Cada scope tem seu próprio `InertiaService`, manifest, SSR loader, e shared props. Controllers selecionam via `@UseInertia('admin')`. Diferencial real vs Adonis/Laravel (nenhum dos dois cobre).

### 4.4 Render — duas APIs coexistindo

**(a) Decorator (idiomática, framework-agnostic):**
```ts
@Get('/')
@Inertia('Home')
show() {
  return { hello: 'world' };
}
```

**(b) Imperative (controle fino, como no Navy hoje):**
```ts
@Get('/crew')
async list(@Req() req: Request) {
  return req.inertia.share({ flash }).render('Crew', { crew });
}
```

Em Fastify, `request.inertia` (decorate via `onRequest` hook).

### 4.5 API de props (paridade Inertia v2)

```ts
import { Inertia } from '@dudousxd/nestjs-inertia';

return {
  user: Inertia.always(() => this.users.current()),
  stats: Inertia.optional(() => this.stats.heavy()),
  activity: Inertia.defer(() => this.activity.feed(), 'secondary'),
  transactions: Inertia.merge(() => this.tx.page(p), { matchOn: 'id' }),
};
```

Marcadores resolvidos no `InertiaService.render()` respeitando headers de partial reload (`X-Inertia-Partial-Component`, `X-Inertia-Partial-Data`).

### 4.6 Redirects e history

```ts
req.inertia.location('https://stripe.com/...');  // 409 + X-Inertia-Location
req.inertia.encryptHistory();
req.inertia.clearHistory();                       // após logout
```

### 4.7 Utilitários opt-in (re-exportados)

```ts
import {
  InertiaAuthGuard,         // 409 (XHR) vs 302 (initial GET); config: signInUrl, allowList
  InertiaNotFoundFilter,    // render 'NotFound' fora de /api
  ErrorBagInterceptor,      // X-Inertia-Error-Bag namespace
  CsrfCookieInterceptor,    // XSRF-TOKEN pattern + CsrfGuard companion
} from '@dudousxd/nestjs-inertia';
```

CSRF fica **opt-in no core** (não em sub-pacote). Cookie-parser/fastify-cookie peer-deps falham só em runtime se o dev habilitar sem instalar.

### 4.8 Tipos globais

```ts
declare global {
  namespace Express {
    interface Request { inertia: InertiaService<DefaultScope> }
  }
}
declare module 'fastify' {
  interface FastifyRequest { inertia: InertiaService<DefaultScope> }
}
```

`SharedProps` inferido do retorno de `share()` (registry via declaration merging — ver Seção 8.4).

## 5. Protocolo, middleware e interceptors

### 5.1 Pipeline de request

```
Incoming HTTP
  ├─ MethodSpoofMiddleware     (POST + _method=PUT → req.method=PUT) [auto, desativável]
  ├─ InertiaMiddleware (core)  (decora req.inertia; suppressPostSendWrites)
  ├─ [user middlewares]
  └─ Route handler
       ├─ @Inertia('Page') decorator → InertiaRenderInterceptor
       │     ├─ Resolve shared props (forRoot.share + forFeature.share + req.inertia.share)
       │     ├─ Aplica partial-reload filtering
       │     ├─ Resolve marcadores (always/optional/defer/merge)
       │     ├─ Verifica X-Inertia-Version → 409 + X-Inertia-Location se stale
       │     ├─ Se X-Inertia → res.json(page)
       │     └─ Senão → SSR (se habilitado) → shell HTML via rootView
       │
       └─ Redirect normal → RedirectInterceptor
             └─ Se 302 + method ∈ {PUT,PATCH,DELETE} → upgrade pra 303
```

### 5.2 Adapter HTTP (Express + Fastify) — design

Camada de adapter abstrai req/res:
- Express: `NestMiddleware` via `configure(consumer)`, `forRoutes('*')`.
- Fastify: hook `onRequest` em `onApplicationBootstrap`, `decorateRequest('inertia', null)` no boot.

O `suppressPostSendWrites` é portado pros dois (em Fastify, intercepta `reply.send` após `reply.sent === true`).

### 5.3 Resoluções automáticas (knobs com defaults sólidos)

| Comportamento | Default | Configurável |
|---|---|---|
| 302 → 303 em PUT/PATCH/DELETE | ligado | `autoUpgrade303: false` (não recomendado) |
| `_method` spoofing em POST multipart | ligado | `methodSpoofing: false` |
| Suppressão de double-send | sempre ligado | não-configurável (correção de bug do Nest serializer) |
| Asset version SHA1 do manifest em prod | ligado | `version: () => string` override |
| SSR | off em dev, on em prod | `ssr.enabled` |

### 5.4 Partial reloads, deferred, merge, optional, always

Implementação detalhada no `InertiaService.render()`:

1. Se `X-Inertia-Partial-Component !== component` → ignora headers (não é partial).
2. Senão, monta `keep = X-Inertia-Partial-Data?.split(',') || []`.
3. Pra cada prop:
   - `Inertia.always(fn)` → sempre resolve.
   - `Inertia.optional(fn)` → resolve só se está em `keep`.
   - Prop comum → resolve só se em `keep` (ou se não há filtro = full reload).
   - `Inertia.defer(fn, group)` → não resolve; vai pro payload `deferredProps`.
   - `Inertia.merge(fn, opts)` → resolve normal, marca metadata `mergeProps` + `matchPropsOn` no payload.

### 5.5 CSRF (opt-in)

`CsrfCookieInterceptor` (global) + `CsrfGuard` (handlers de mutação):
- Escreve cookie `XSRF-TOKEN` (httpOnly: false, signed) na primeira GET.
- Valida `X-XSRF-TOKEN` header em POST/PUT/PATCH/DELETE.
- Peer-deps `cookie-parser` (Express) ou `@fastify/cookie` (Fastify).

### 5.6 Error bags

`ErrorBagInterceptor` (opt-in) — quando `X-Inertia-Error-Bag: signin`, namespaceia prop `errors`: `errors.signin.email`.

## 6. Shell HTML (template-based)

### 6.1 Default — arquivo HTML com diretivas próprias da lib

```html
<!-- inertia/root.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/favicon.svg" />
    @inertiaHead
    @vite('app/client.tsx')
    @viteRefresh
  </head>
  <body>
    @inertia
  </body>
</html>
```

Diretivas reconhecidas:

| Diretiva | Expande pra |
|---|---|
| `@inertia` | `<div id="app" data-page="...">` em CSR ou SSR body se SSR enabled |
| `@inertiaHead` | SSR `<head>` strings + tags `<Head>` do cliente Inertia |
| `@vite('entry')` | Em dev: `<script type="module" src="/@vite/client">` + entry raw. Em prod: `<script type="module" src="/assets/<hash>.js">` + `<link rel="stylesheet">` do CSS associado |
| `@viteRefresh` | React Refresh preamble (no-op se não é React ou em prod) |
| `@asset('path')` | Path resolvido (em prod, hash do manifest; em dev, path raw) |

Parse via regex, sem deps externas. **Conteúdo do `<head>` é responsabilidade do dev** — diretivas só injetam o que precisa de resolução server-side. Estilos, fontes, theme-color, etc. ficam no arquivo template como HTML normal.

### 6.2 Com template engine configurado no Nest

Se `app.setViewEngine('hbs')` (ou `.ejs`/`.pug`/`.liquid`) detectado via `HttpAdapterHost`:

```hbs
<!-- inertia/root.hbs -->
<!doctype html>
<html lang="{{lang}}">
  <head>
    {{{inertiaHead}}}
    {{{vite "app/client.tsx"}}}
  </head>
  <body>{{{inertia}}}</body>
</html>
```

Lib registra helpers (`vite`, `inertia`, `inertiaHead`, `asset`) automaticamente no engine no boot.

### 6.3 Escape hatch programático

```ts
forRoot({
  rootView: ({ page, ssr, manifest, assetVersion, ctx }) => '<!doctype html>...',
});
```

### 6.4 Resolução

1. Se `rootView` é função → usa direto.
2. Senão `rootView` string → resolve path (relativo à `cwd()`):
   - Extensão `.html` → parse regex próprio.
   - Outra extensão + engine configurado → delega ao engine.

## 7. SSR, Vite e asset versioning

### 7.1 SSR loader

Portado do Navy 1:1 com 3 melhorias:
- Múltiplos scopes (cada `forFeature` tem seu loader).
- Hot reload em dev opcional (`ssr.devMode: 'vite'` usa `viteDevServer.ssrLoadModule`).
- `throwOnError: true|false` (Laravel-style; default `false`).

### 7.2 Pacote `@dudousxd/nestjs-inertia-vite`

**Helper de bootstrap:**
```ts
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';

await setupInertiaVite(app, {
  mode: process.env.NODE_ENV,
  root: 'inertia',
  publicDir: 'inertia/public',
  outDir: 'dist/inertia',
});
```

Em dev: sobe Vite em middleware mode, injeta `/@vite/client` + React Refresh preamble no shell, HMR port configurável.
Em prod: serve `dist/inertia/client/assets/*` com `Cache-Control: max-age=1y, immutable`; serve resto com `max-age=1h, fallthrough: true`.

**Vite plugin:**
```ts
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';

export default defineConfig({
  plugins: [nestInertia({ ssr: true })],
});
```

Camada fina sobre `@vitejs/plugin-react` (ou Vue/Svelte): define manifest, outDir, build SSR, aliases.

### 7.3 Asset versioning

Resolução:
- Explícito: `forRoot({ version: '...' })` ou `version: () => Promise<string>`.
- Default prod: SHA1 do manifest JSON.
- Default dev: UUID por boot.

### 7.4 Framework-agnostic no client

A lib **não vincula** React/Vue/Svelte. O `inertia/ssr/entry.tsx` é responsabilidade do dev. Documentação tem exemplos pros três adapters Inertia oficiais.

## 8. Codegen (`@dudousxd/nestjs-inertia-codegen`)

### 8.1 Pasta de saída

`.nestjs-inertia/` no root do projeto. Adicionado ao `.gitignore` pelo `nestjs-inertia init`.

```
.nestjs-inertia/
├── pages.d.ts              # InertiaPages: união de componentes + tipos de props
├── shared-props.d.ts       # SharedProps inferido de forRoot.share + scopes
├── components.json         # discovery cache (incremental rebuild)
└── index.d.ts              # re-export tudo
```

### 8.2 Discovery de pages

```ts
// nestjs-inertia.config.ts
export default defineConfig({
  pages: {
    glob: 'inertia/pages/**/*.{tsx,vue,svelte}',
    propsExport: 'ComponentProps',
  },
  scopes: {
    admin: { glob: 'inertia/admin/**/*.tsx', prefix: 'admin/' },
  },
  codegen: { outDir: '.nestjs-inertia' },
});
```

Convenção: `export type ComponentProps = {...}` em cada page (explícito, robusto). Fallback `any` quando ausente.

### 8.3 CLI

```bash
nestjs-inertia init             # cria nestjs-inertia.config.ts + .gitignore entry
nestjs-inertia codegen          # one-shot
nestjs-inertia codegen --watch  # standalone (escape hatch)
```

### 8.4 Watch automático integrado ao Module

Em `forRoot()`, `OnApplicationBootstrap`:
1. Se `process.env.NODE_ENV === 'production'` (string match exato) → no-op.
2. Senão tenta `require('@dudousxd/nestjs-inertia-codegen')`:
   - Resolve → liga watcher interno (chokidar, glob dos pages). Reroda no save.
   - Não resolve → loga skip silencioso.
3. `OnApplicationShutdown` fecha o watcher (graceful).

Override explícito via `codegen.enabled: boolean | 'auto'` (default `'auto'` = a regra acima).

Conflito com Vite plugin watcher detectado via lock file `.nestjs-inertia/.watcher.lock`; segundo a ligar loga warn + no-op.

### 8.5 Module augmentation

```ts
// nestjs-inertia.d.ts (gerado pelo init)
import type { InertiaPages, InertiaSharedProps } from '@dudousxd/nestjs-inertia-codegen';

declare module '@dudousxd/nestjs-inertia' {
  interface InertiaRegistry {
    pages: InertiaPages;
    shared: InertiaSharedProps;
  }
}
```

Daí `@Inertia('Dashboard')` é typesafe sem generic.

### 8.6 API programática

```ts
export async function generate(config: ResolvedConfig): Promise<void>;
export function watch(config: ResolvedConfig, onChange?: () => void): Watcher;
```

Consumida pelo CLI, pelo Vite plugin, e pelo `InertiaModule` (uma só impl).

### 8.7 Limitações conscientes da v1

- Não inferimos props automaticamente do JSX — exige `export type ComponentProps`.
- Watch performance baseada em TS Language Service (`ts.createWatchProgram`).

## 9. Client typed (`@dudousxd/nestjs-inertia-client`) — Tuyau-style

### 9.1 Discovery (sem hardcode de path)

Via `DiscoveryService` + `Reflector` do Nest:
- Pra cada controller, lê `path` metadata + handlers.
- Pra cada handler, lê method HTTP, sub-path, params (`@Param`, `@Query`, `@Body`).
- Decorators custom (`@Inertia('Name')`, `@ApplyContract(...)`, `@RouteName('...')`) lidos via `Reflect.getMetadata`.

### 9.2 Classificação Inertia-page vs REST

| Caso | Classificação |
|---|---|
| `@Inertia('Page')` | → `InertiaPages` (typed page) |
| Sem `@Inertia`, retorna JSON | → REST client (typed route) |
| Imperative (`req.inertia.render()` no body) sem decorator | → REST por default; dev marca `@Inertia()` sem nome pra forçar discovery |
| Health-check / metrics | → exclusão automática (lista configurável: `@nestjs/terminus`, `@willsoto/nestjs-prometheus`) |

### 9.3 Tipagem de body/query/response — três caminhos suportados

Em ordem de preferência:
1. **Zod via `@ApplyContract(Schema)`** (recomendado): lib lê schema em runtime, extrai types.
2. **DTOs class-validator + `@ApiResponse({ type: Dto })`**: lib lê via `class-transformer` metadata + `@nestjs/swagger` reflection.
3. **TS puro (`Promise<UserDto>`)**: lib usa TS Language Service no codegen pra extrair return type. Mais frágil.

Se nenhum aplica → `unknown` no client + warn no log.

### 9.4 Exemplos dos três caminhos de tipagem

**(a) Zod via `@ApplyContract`:**
```ts
const ListCrew = Contract.get('/api/v1/crew', {
  query: z.object({ baseId: z.string().uuid().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
  name: 'crew.list',
});

@Controller()
export class CrewController {
  @ApplyContract(ListCrew)
  list(@Query() q: z.infer<typeof ListCrew.query>) {
    return this.svc.list(q);
  }
}
```

**(b) class-validator DTOs + `@ApiResponse`:**
```ts
@Controller()
export class CrewController {
  @Get('/api/v1/crew')
  @ApiResponse({ type: [CrewDto] })
  @RouteName('crew.list')
  list(@Query() q: ListCrewQueryDto): Promise<CrewDto[]> {
    return this.svc.list(q);
  }
}
```
Codegen lê `@ApiResponse` + tipos do DTO via `class-transformer` reflection. Requer `reflect-metadata` no projeto (default Nest).

**(c) TS puro (fallback):**
```ts
@Controller()
export class CrewController {
  @Get('/api/v1/crew')
  list(@Query() q: ListCrewQueryDto): Promise<CrewDto[]> {
    return this.svc.list(q);
  }
}
```
Codegen extrai via TS Language Service no build (`getReturnTypeOfSignature`). Frágil contra interceptors que mudam shape — emite warn quando detectado.

**Heurística de prioridade dentro de um único handler:** `(a) Zod > (b) class-validator > (c) TS puro`. Nenhum aplicável → `unknown` no client + warn.

### 9.5 Arquivos gerados

```ts
// .nestjs-inertia/routes.ts
export const route = <K extends RouteName>(name: K, params?: RouteParams<K>): string => { /* ... */ };
route('crew.show', { id: 42 })         // → '/api/v1/crew/42'

// .nestjs-inertia/api.ts (framework-agnostic via @tanstack/query-core)
import { queryOptions } from '@tanstack/query-core';

export const api = {
  'crew.list': {
    queryOptions: (query?: { baseId?: string }) =>
      queryOptions({
        queryKey: ['crew.list', query],
        queryFn: () => fetcher.get<CrewDto[]>('/api/v1/crew', { query }),
      }),
  },
  'crew.create': {
    mutationOptions: () => ({
      mutationFn: (body: CreateCrewDto) =>
        fetcher.post<CrewDto>('/api/v1/crew', { body }),
    }),
  },
};

// Helpers compartilhados
export function invalidate<K extends keyof AppRouter>(name: K): Promise<void>;
export type InferResponse<K extends keyof AppRouter> = AppRouter[K]['response'];
```

### 9.6 Uso no frontend (mesmo arquivo gerado, três frameworks)

```tsx
// React
import { useQuery } from '@tanstack/react-query';
const { data } = useQuery(api['crew.list'].queryOptions({ baseId }));
```

```vue
<!-- Vue -->
<script setup>
import { useQuery } from '@tanstack/vue-query';
const { data } = useQuery(api['crew.list'].queryOptions({ baseId }));
</script>
```

```svelte
<!-- Svelte -->
<script>
  import { createQuery } from '@tanstack/svelte-query';
  const query = createQuery(api['crew.list'].queryOptions({ baseId }));
</script>
```

Zero adapter por framework — TanStack Query v5 `queryOptions()` desacopla.

### 9.7 Compartilhamento com Inertia page props

```tsx
// inertia/pages/Crew.tsx
import type { InferResponse } from '@/.nestjs-inertia/api';

export type ComponentProps = {
  crew: InferResponse<'crew.list'>;   // reusa tipo do server
};

export default function Crew({ crew }: ComponentProps) {
  const { data } = useQuery(api['crew.list'].queryOptions(
    { baseId },
    { initialData: crew, staleTime: 30_000 },
  ));
}
```

### 9.8 SSR-safe hydration

```ts
import { hydrateClientFromInertia } from '@dudousxd/nestjs-inertia-client/ssr';

export default createServer(async (page) => {
  const queryClient = hydrateClientFromInertia(page);
  return createInertiaApp({ /* ... */ });
});
```

Usa `@tanstack/query-core` (framework-agnostic).

## 10. Testing (`@dudousxd/nestjs-inertia-testing`)

### 10.1 Dois modos de uso

**E2E via supertest:**
```ts
const res = await request(app.getHttpServer()).get('/dashboard').set('X-Inertia', 'true');
expectInertia(res).toRenderComponent('Dashboard').toHaveProp('user.id', 42);
```

**Sobre payload JSON cru:**
```ts
assertInertia(payload).toRenderComponent('Dashboard');
```

### 10.2 API fluent (resumo)

```ts
interface InertiaAssertion {
  toRenderComponent(name: string): this;
  toHaveUrl(url: string | RegExp): this;
  toHaveVersion(matcher: string | jest.AsymmetricMatcher): this;
  toHaveProp(path: string, value?: unknown): this;
  toHavePropMatching(path: string, matcher: RegExp | jest.AsymmetricMatcher): this;
  toMissProp(path: string): this;
  toHaveExactProps(props: Record<string, unknown>): this;
  toShareProp(path: string, value?: unknown): this;
  toHaveDeferredProp(name: string, group?: string): this;
  toHaveMergeProp(name: string, opts?: { matchOn?: string; strategy?: 'append' | 'prepend' }): this;
  toHaveAlwaysProp(name: string): this;
  toHaveOptionalProp(name: string): this;
  toRedirectExternal(url: string): this;
  toRedirectTo(url: string, status?: 302 | 303): this;
  toHaveErrors(errors: Record<string, string | RegExp>): this;
  toHaveErrorBag(bag: string): this;
  toRenderFullHtml(): this;
  withSsrHead(pattern: RegExp): this;
  page(): PageObject;
  unwrap(): { component: string; props: Props; url: string; version: string };
}
```

### 10.3 Helpers de teste unitário (sem subir app)

```ts
import { InertiaTestingModule, createFakeInertiaRequest, createFakeInertiaResponse, expectInertiaRequest } from '@dudousxd/nestjs-inertia-testing';

const moduleRef = await Test.createTestingModule({
  imports: [InertiaTestingModule.forTest({ /* opts */ })],
  controllers: [DashboardController],
  providers: [{ provide: UserService, useValue: mockUsers }],
}).compile();

const controller = moduleRef.get(DashboardController);
const fakeReq = createFakeInertiaRequest({ method: 'GET', url: '/dashboard' });
const fakeRes = createFakeInertiaResponse();
await controller.show(fakeReq);
expectInertiaRequest(fakeReq, fakeRes).toRenderComponent('Dashboard').toHaveProp('user.id', 42);
```

### 10.4 Partial reload testing

```ts
const res = await request(app.getHttpServer())
  .get('/dashboard')
  .set('X-Inertia', 'true')
  .set('X-Inertia-Partial-Component', 'Dashboard')
  .set('X-Inertia-Partial-Data', 'stats');

expectInertia(res)
  .toRenderComponent('Dashboard')
  .toHaveProp('stats')
  .toMissProp('activity')
  .toMissProp('transactions');
```

Engine de teste **roda o filtro de partial reload** igual produção — pega regressão.

### 10.5 Frameworks de teste suportados

Jest + Vitest desde v1 via `expect.extend` (`import '@dudousxd/nestjs-inertia-testing/jest'` ou `/vitest`). Plain `assert` também (Node test runner, ava).

### 10.6 Diffs amigáveis nas falhas

Inspirado em `jest-extended`/`@testing-library/jest-dom`. `failureMessage()` lista props disponíveis, trunca page object pra orientar dev. Não exibe `[object Object]`.

### 10.7 Typed assertions (com codegen)

```ts
expectInertia<InertiaPages>(res)
  .toRenderComponent('Dashboard')
  .toHaveProp('user.email');   // autocomplete + erro de compilação se prop não existe
```

Sem codegen, fallback `Record<string, unknown>`.

## 11. CI, release, docs

### 11.1 GitHub Actions

| Workflow | Trigger | Função |
|---|---|---|
| `ci.yml` | PR + push | install → lint (Biome) → typecheck → test (Vitest) → build → integration tests dos examples |
| `release.yml` | push em `main` | Changesets version PR → no merge desse PR, `npm publish` em ordem topológica |
| `docs.yml` | push em `main` | build & deploy Astro Starlight (Cloudflare Pages) |
| `examples.yml` | nightly + PRs em `packages/*` | smoke test matriz Express/Fastify × React/Vue |

Matriz Node: 20 + 22 LTS. pnpm 9. Coverage report via codecov.

### 11.2 Release process (Changesets)

```bash
# Dev no PR:
pnpm changeset                    # marca pacotes + bump + descrição
# Merge em main:
# release.yml gera PR "Version Packages"
# Merge desse PR:
pnpm changeset publish            # npm publish em ordem topológica
```

**SemVer:** começa em `0.x` (breaking changes permitidas documentadas). `1.0` quando docs + todos os examples + ≥3 projetos externos validam (ou após 6 meses sem mudança de API, o que vier primeiro). Pacotes em **lockstep no major**, independentes no minor.

### 11.3 Docs site

Astro Starlight em `docs/`. Estrutura:

```
docs/src/content/docs/
├── getting-started.mdx
├── guides/
│   ├── installation.mdx
│   ├── shell-customization.mdx
│   ├── ssr.mdx
│   ├── partial-reloads.mdx
│   ├── deferred-props.mdx
│   ├── csrf.mdx
│   ├── file-uploads.mdx
│   ├── multi-app.mdx
│   ├── testing.mdx
│   ├── codegen.mdx
│   └── typed-client.mdx
├── api/                           # auto-gerado via typedoc
├── migration/
│   ├── from-inertia-nestjs.mdx
│   ├── from-adonis-inertia.mdx
│   └── from-manual-setup.mdx
└── examples/
    ├── express-react.mdx
    ├── fastify-vue.mdx
    └── monorepo-multi-app.mdx
```

Princípios: cada guide começa com "Problema → Solução → Código"; exemplos rodáveis (extraídos de `examples/`, validados no CI); páginas "Why" pros patterns não-óbvios (302→303 upgrade, `suppressPostSendWrites`, `_method` spoof).

### 11.4 Launch checklist

Pré-1.0, em ordem:
1. Repo público com README ≥ tutorial completo.
2. Docs site no ar.
3. ≥ 2 exemplos funcionais (Express+React, Fastify+Vue).
4. Blog post comparando com Adonis (cita `@adonisjs/inertia` como inspiração, sem combate).
5. Discord/GitHub Discussions ativos.
6. Posts: r/nestjs, r/InertiaJS, dev.to, NestJS Discord (`#showcase`), Inertia.js Discord (`#community`).
7. Conversa com Jonathan Reinink (Inertia core) e Romain Lanz (`@adonisjs/inertia`) antes do release público — pede feedback no design, evita atrito político.

### 11.5 Risco de mantenedor único — mitigações

- `MAINTAINERS.md` documentando processo de release.
- Commit access cedo pros primeiros 2-3 contribuidores ativos.
- Bot Stale (30 dias inativo → marca → 14 dias → fecha). Documentado.
- Política pública no README: "issues sem repro fecham em 14 dias", "features só após RFC".

## 12. Roadmap pós-v1 (não-comprometido)

| Versão | Candidatas |
|---|---|
| v1.1 | `@dudousxd/nestjs-inertia-graphql` (page renders sourced de GraphQL resolvers) |
| v1.2 | `@FormHandler` decorator pra forms Inertia (Adonis tem similar) |
| v1.3 | Live reload de SSR via Vite middleware em dev (sem restart) |
| v2.0 | Suporte a Nest fast HTTP server (uWebSockets.js) — depende do Nest oficial |
| Indefinido | Conversa com Inertia core sobre `@inertiajs/nestjs` oficial |

## 13. Métricas de sucesso (em ordem de prioridade)

1. Adoção real (downloads npm + stars GitHub).
2. Issues abertas vs fechadas (saúde do projeto).
3. PRs externos mergeados.
4. Projetos no GitHub com `@dudousxd/nestjs-inertia` no package.json (via API GitHub).
5. Tempo médio entre release.

Não persegue stars ou hype. Persegue adoção honesta e issues fechadas com fix.

## 14. Origem dos artefatos no Navy

Pra cada arquivo da lib v1, qual `src/inertia/*.ts` do `~/goflipai/navy-nestjs/` é base:

| Lib (destino) | Navy (origem) | Mudança |
|---|---|---|
| `core/src/module.ts` | `inertia.module.ts` | `forRoot/forRootAsync/forFeature/forFeatureAsync` + remove `NavyInertiaMiddleware` |
| `core/src/middleware/express.ts` | `inertia.middleware.ts` | Mantém `suppressPostSendWrites`; multi-scope aware |
| `core/src/middleware/fastify.ts` | novo | Equivalente do middleware via `onRequest` hook |
| `core/src/service.ts` | `inertia.service.ts` | + `location()`, `encryptHistory()`, `clearHistory()`, partial reload filtering, Inertia v2 markers (`always/optional/defer/merge`) |
| `core/src/shell/renderer.ts` | `shell.ts` | Substitui hardcodes (`navy.svg`, fonts) por arquivo template + diretivas |
| `core/src/ssr/loader.ts` | `ssr-loader.service.ts` | + multi-scope, + `devMode: 'vite'`, + `throwOnError` |
| `core/src/asset/version.ts` | `asset-version.provider.ts` | Mantém; manifestPath configurável |
| `core/src/guards/auth.ts` | `inertia-auth.guard.ts` | Mantém; signInUrl + allowList configuráveis |
| `core/src/filters/not-found.ts` | `common/exceptions/inertia-not-found.filter.ts` | Mantém; componente "NotFound" configurável; api prefix configurável |
| **Excluído da lib** | `navy-inertia.middleware.ts` | Específico do Navy (share auth/role) — fica no projeto |

## 15. Open questions resolvidas no brainstorming

- Q: Pacote único vs monorepo? → **Monorepo** (Seção 3).
- Q: Scope npm? → **`@dudousxd/...`** (Seção 2.6).
- Q: API render? → **Decorator + imperative coexistindo** (Seção 4.4).
- Q: Adapter HTTP? → **Express + Fastify desde v1** (Seção 5.2).
- Q: Shell? → **Arquivo template + diretivas + escape hatch** (Seção 6).
- Q: Onde codegen escreve? → **`.nestjs-inertia/` no root** (Seção 8.1).
- Q: Watch automático? → **Integrado ao Module em dev** (Seção 8.4).
- Q: Frameworks target (client)? → **Framework-agnostic via `queryOptions`** (Seção 9.6).
- Q: Discovery de rotas (REST vs Inertia)? → **Via decorator, não path** (Seção 9.2).
- Q: Tipagem (Zod vs class-validator vs TS)? → **Os três suportados** (Seção 9.3).

## 16. Open questions deixadas pro plano de implementação

- Estratégia exata de migration de projetos `inertia-nestjs` existentes (codemod? manual?). Decisão durante writing-plans.
- Versionamento de protocolo Inertia: como detectar e degradar pra v1 se cliente é antigo? Provavelmente fora de escopo v1.
- Exemplo de monorepo-multi-app: qual stack pra demo? Provavelmente Express + React + 2 scopes (admin + portal).
- Política de breaking changes em 0.x: minor bump ou patch? Convenção a definir antes do primeiro release.

---

**Próximo passo:** invocar skill `writing-plans` pra gerar plano de implementação detalhado a partir deste spec.
