/**
 * Unit tests for extractZodFromDto — pure-AST class-validator → zod translation.
 * One case per §2.2 mapping table row, plus nesting / arrays / enums / messages /
 * unmappable decorators / recursion.
 */
import { Project } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractZodFromDto } from '../../src/discovery/dto-to-zod.js';

function dtoSchema(
  source: string,
  className = 'Dto',
): { text: string; nested: Map<string, string>; warnings: string[] } {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const file = project.createSourceFile('dto.ts', source);
  const cls = file.getClassOrThrow(className);
  const result = extractZodFromDto(cls, file, project);
  return { text: result.schemaText, nested: result.namedNestedSchemas, warnings: result.warnings };
}

describe('extractZodFromDto — §2.2 mapping table', () => {
  it('@IsString → z.string()', () => {
    const { text } = dtoSchema('class Dto { @IsString() a!: string; }');
    expect(text).toBe('z.object({ a: z.string() })');
  });

  it('@IsNumber → z.number(), @IsInt → z.number().int()', () => {
    expect(dtoSchema('class Dto { @IsNumber() a!: number; }').text).toContain('a: z.number()');
    expect(dtoSchema('class Dto { @IsInt() a!: number; }').text).toContain('a: z.number().int()');
  });

  it('@IsBoolean → z.boolean()', () => {
    expect(dtoSchema('class Dto { @IsBoolean() a!: boolean; }').text).toContain('a: z.boolean()');
  });

  it('@IsDate → z.coerce.date()', () => {
    expect(dtoSchema('class Dto { @IsDate() a!: Date; }').text).toContain('a: z.coerce.date()');
  });

  it('@IsEmail → z.string().email()', () => {
    expect(dtoSchema('class Dto { @IsEmail() a!: string; }').text).toContain(
      'a: z.string().email()',
    );
  });

  it('@IsUrl / @IsUUID → z.string().url() / .uuid()', () => {
    expect(dtoSchema('class Dto { @IsUrl() a!: string; }').text).toContain('a: z.string().url()');
    expect(dtoSchema('class Dto { @IsUUID() a!: string; }').text).toContain('a: z.string().uuid()');
  });

  it('@MinLength/@MaxLength → .min()/.max()', () => {
    const { text } = dtoSchema('class Dto { @IsString() @MinLength(3) @MaxLength(8) a!: string; }');
    expect(text).toContain('a: z.string().min(3).max(8)');
  });

  it('@Length(min,max) → .min().max()', () => {
    expect(dtoSchema('class Dto { @Length(2, 5) a!: string; }').text).toContain('.min(2).max(5)');
  });

  it('@Min/@Max → numeric .min()/.max()', () => {
    const { text } = dtoSchema('class Dto { @IsNumber() @Min(1) @Max(10) a!: number; }');
    expect(text).toContain('a: z.number().min(1).max(10)');
  });

  it('@IsPositive/@IsNegative → .positive()/.negative()', () => {
    expect(dtoSchema('class Dto { @IsNumber() @IsPositive() a!: number; }').text).toContain(
      '.positive()',
    );
    expect(dtoSchema('class Dto { @IsNumber() @IsNegative() a!: number; }').text).toContain(
      '.negative()',
    );
  });

  it('@Matches(/re/) → .regex(/re/)', () => {
    const { text } = dtoSchema('class Dto { @Matches(/^\\d{5}$/) a!: string; }');
    expect(text).toContain('.regex(/^\\d{5}$/)');
  });

  it('@IsOptional → .optional()', () => {
    expect(dtoSchema('class Dto { @IsString() @IsOptional() a?: string; }').text).toContain(
      'a: z.string().optional()',
    );
  });

  it('@IsNotEmpty on string → .min(1)', () => {
    expect(dtoSchema('class Dto { @IsString() @IsNotEmpty() a!: string; }').text).toContain(
      'a: z.string().min(1)',
    );
  });

  it('@IsObject without nested info → z.object({}).passthrough()', () => {
    expect(dtoSchema('class Dto { @IsObject() a!: object; }').text).toContain(
      'a: z.object({}).passthrough()',
    );
  });

  it('@Allow → z.unknown()', () => {
    expect(dtoSchema('class Dto { @Allow() a!: any; }').text).toContain('a: z.unknown()');
  });

  it('@IsDefined keeps the field required (no .optional())', () => {
    const { text } = dtoSchema('class Dto { @IsString() @IsDefined() a!: string; }');
    expect(text).toContain('a: z.string()');
    expect(text).not.toContain('.optional()');
  });

  it('custom { message } is forwarded into the zod call', () => {
    const { text } = dtoSchema(`class Dto { @IsEmail({ message: 'Bad email' }) a!: string; }`);
    expect(text).toContain("a: z.string().email({ message: 'Bad email' })");
  });
});

describe('extractZodFromDto — enums', () => {
  it('@IsEnum(StringEnum) resolves members to z.enum([...])', () => {
    const { text } = dtoSchema(
      `enum Role { Admin = 'admin', User = 'user' }
       class Dto { @IsEnum(Role) role!: Role; }`,
    );
    expect(text).toContain('role: z.enum(["admin", "user"])');
  });

  it('@IsIn([...]) of strings → z.enum([...])', () => {
    const { text } = dtoSchema(`class Dto { @IsIn(['a', 'b']) a!: string; }`);
    expect(text).toContain("a: z.enum(['a', 'b'])");
  });
});

describe('extractZodFromDto — nesting and arrays', () => {
  it('@ValidateNested + @Type(() => Child) → hoisted ChildSchema reference', () => {
    const { text, nested } = dtoSchema(
      `class Address { @IsString() city!: string; }
       class Dto { @ValidateNested() @Type(() => Address) address!: Address; }`,
    );
    expect(text).toContain('address: AddressSchema');
    expect(nested.get('AddressSchema')).toBe('z.object({ city: z.string() })');
  });

  it('@IsArray + @ValidateNested({each:true}) + @Type → z.array(ChildSchema)', () => {
    const { text, nested } = dtoSchema(
      `class Item { @IsNumber() qty!: number; }
       class Dto { @IsArray() @ValidateNested({ each: true }) @Type(() => Item) items!: Item[]; }`,
    );
    expect(text).toContain('items: z.array(ItemSchema)');
    expect(nested.get('ItemSchema')).toBe('z.object({ qty: z.number() })');
  });

  it('plain T[] type → z.array(base)', () => {
    const { text } = dtoSchema('class Dto { @IsString({ each: true }) tags!: string[]; }');
    expect(text).toContain('tags: z.array(z.string())');
  });

  it('self-referential nesting → recursive schema degraded to z.unknown()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { text, nested, warnings } = dtoSchema(
      'class Node { @ValidateNested() @Type(() => Node) child!: Node; }',
      'Node',
    );
    // Top level references the hoisted nested schema name…
    expect(text).toContain('child: NodeSchema');
    // …but a recursive schema cannot be emitted as `const X = (… X …)` without a
    // type annotation (implicit any / TS7022). It is degraded to a valid
    // z.unknown() placeholder — and must NOT contain an unannotated self-ref.
    expect(nested.get('NodeSchema')).toBe('z.unknown() /* recursive type — not expanded */');
    expect(nested.get('NodeSchema')).not.toContain('z.lazy');
    expect(warnings.some((w) => w.toLowerCase().includes('recursive'))).toBe(true);
    warnSpy.mockRestore();
  });
});

describe('extractZodFromDto — enum resolved through a re-export chain', () => {
  it('follows `export { Enum } from`/bare `export { Enum }` to resolve members', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    });
    // Enum is DEFINED here…
    project.createSourceFile(
      '/enums.ts',
      `export enum Status { Pending = 'pending', Done = 'done' }`,
    );
    // …imported and bare re-exported here (the shape flip uses for entity files)…
    project.createSourceFile(
      '/entity.ts',
      `import { Status } from './enums';\nexport { Status };\nexport class Entity { status!: Status; }`,
    );
    // …and the DTO imports it from the entity (NOT the defining file).
    const dtoFile = project.createSourceFile(
      '/dto.ts',
      `import { Status } from './entity';\nclass Dto { @IsEnum(Status) status!: Status; }`,
    );
    const result = extractZodFromDto(dtoFile.getClassOrThrow('Dto'), dtoFile, project);
    expect(result.schemaText).toContain('status: z.enum(["pending", "done"])');
    expect(result.schemaText).not.toContain('z.nativeEnum');
  });
});

describe('extractZodFromDto — unresolvable enums', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('@IsEnum(Unresolvable) falls back to z.unknown() (never a bare nativeEnum identifier)', () => {
    // The enum identifier is not declared/importable in scope, so emitting
    // `z.nativeEnum(Foo)` would reference a name absent from the generated forms
    // file → a `Cannot find name` compile error. Degrade to z.unknown() instead.
    const { text, warnings } = dtoSchema('class Dto { @IsEnum(Foo) a!: unknown; }');
    expect(text).toContain('z.unknown()');
    expect(text).not.toContain('z.nativeEnum');
    expect(warnings.some((w) => w.includes('IsEnum(Foo)'))).toBe(true);
  });
});

describe('extractZodFromDto — unmappable decorators', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('keeps the base type, appends a comment, and warns once', () => {
    const { text, warnings } = dtoSchema(
      'class Dto { @IsString() @IsStrongPassword() password!: string; }',
    );
    expect(text).toContain('z.string()');
    expect(text).toContain('/* @IsStrongPassword: not translatable to zod (server-only) */');
    expect(warnings.some((w) => w.includes('IsStrongPassword'))).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('uses a block comment so the object close + following fields survive', () => {
    // Regression: schemas are emitted on a single line, so a `//` comment after
    // an unmappable field swallowed the rest of the line (the `})` and any later
    // field), producing invalid TypeScript. A block comment must not.
    const { text } = dtoSchema(
      'class Dto { @IsString() @IsStrongPassword() password!: string; @IsString() note!: string; }',
    );
    expect(text).not.toContain('// @');
    expect(text).toContain('/* @IsStrongPassword');
    // The field after the unmappable one + the object close are not swallowed.
    expect(text).toContain('note:');
    expect(text.trimEnd().endsWith('})')).toBe(true);
  });
});
