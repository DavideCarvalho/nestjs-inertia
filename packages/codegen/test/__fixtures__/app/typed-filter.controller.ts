import { Controller, Get } from '@nestjs/common';

// ── Simulated ORM decorators (same shape as MikroORM/TypeORM) ───────────────
function Property(_opts?: unknown): PropertyDecorator {
  return () => {};
}
function PrimaryKey(_opts?: unknown): PropertyDecorator {
  return () => {};
}
function Enum(_opts?: unknown): PropertyDecorator {
  return () => {};
}
function OneToMany(_opts?: unknown): PropertyDecorator {
  return () => {};
}
function Filterable(_opts?: unknown): ClassDecorator {
  return () => {};
}

export enum Status {
  A = 'A',
  B = 'B',
}

// ── Related entity ──────────────────────────────────────────────────────────
export class Task {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;
}

// ── Root entity with scalar, enum, nullable, and relation fields ────────────
export class Person {
  @Property()
  name!: string;

  @Property()
  age!: number;

  @Property()
  createdAt!: Date;

  @Property()
  active!: boolean;

  @Enum(() => Status)
  status?: Status;

  @Property({ nullable: true })
  deletedAt?: Date;

  @OneToMany({ entity: () => Task })
  tasks!: Task[];
}

// ── Filter using autoFields from the entity ─────────────────────────────────
@Filterable({ entity: Person, autoFields: true })
export class PersonFilter {}

// Simulated ApplyFilter decorator (parameter decorator)
function ApplyFilter(_filterClass: new (...args: unknown[]) => unknown): ParameterDecorator {
  return () => {};
}

@Controller('/api/people')
export class TypedFilterController {
  @Get()
  list(@ApplyFilter(PersonFilter) _qb: unknown) {
    return [];
  }
}
