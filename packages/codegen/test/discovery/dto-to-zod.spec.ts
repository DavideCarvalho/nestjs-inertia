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

  it('self-referential nesting → z.lazy(() => Schema)', () => {
    const { text, nested } = dtoSchema(
      'class Node { @ValidateNested() @Type(() => Node) child!: Node; }',
      'Node',
    );
    // Top level references the hoisted nested schema, which closes the cycle
    // with a z.lazy() self-reference.
    expect(text).toContain('child: NodeSchema');
    expect(nested.get('NodeSchema')).toContain('z.lazy(() => NodeSchema)');
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
    expect(text).toContain('// @IsStrongPassword: not translatable to zod (server-only)');
    expect(warnings.some((w) => w.includes('IsStrongPassword'))).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
