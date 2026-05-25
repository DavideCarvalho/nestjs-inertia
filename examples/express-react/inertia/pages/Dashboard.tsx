import { Link } from '@dudousxd/nestjs-inertia-client/react';
import { useTypedReload } from '@dudousxd/nestjs-inertia-client/react';
import { usePage } from '@inertiajs/react';
import { useQueryClient } from '@tanstack/react-query';
import { api, navigate } from '../../.nestjs-inertia/api.js';

export default function Dashboard({
  user,
  count,
}: { user: { id: number; name: string }; count: number }) {
  const qc = useQueryClient();
  const reload = useTypedReload<'Dashboard'>();
  const page = usePage();

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Hi, {user.name} ({user.id})
      </p>
      <p>Count: {count}</p>
      <p>App: {(page.props as Record<string, unknown>).appName as string}</p>

      <nav>
        <Link
          route="users.list"
          prefetch={api.users.list.queryOptions()}
          queryClient={qc}
        >
          View Users (prefetch on hover)
        </Link>
      </nav>

      <button type="button" onClick={() => reload({ only: ['count'] })}>
        Reload count only
      </button>

      <button type="button" onClick={() => navigate('users.list')}>
        Navigate to users (typed)
      </button>
    </main>
  );
}
