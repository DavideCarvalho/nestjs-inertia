import { Link } from '@dudousxd/nestjs-inertia-client/react';

export type ComponentProps = {
  user: { id: number; name: string };
  count: number;
};

export default function Dashboard({ user, count }: ComponentProps) {
  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Hi, {user.name} ({user.id})
      </p>
      <p>Count: {count}</p>
      <nav>
        <Link route="users.list">View Users</Link>
      </nav>
    </main>
  );
}
