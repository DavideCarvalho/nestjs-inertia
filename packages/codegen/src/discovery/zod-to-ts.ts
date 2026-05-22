/**
 * Minimal recursive Zod-schema-to-TypeScript-source walker.
 * Handles the common schema types needed for contract serialization.
 * The output is a TypeScript type expression string, not a full declaration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToTs(schema: any): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const t: string = schema?._def?.typeName ?? '';
  switch (t) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodLiteral':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return JSON.stringify(schema._def.value);
    case 'ZodEnum':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return (schema._def.values as string[]).map((v) => JSON.stringify(v)).join(' | ');
    case 'ZodArray':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `Array<${zodToTs(schema._def.type)}>`;
    case 'ZodOptional':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `${zodToTs(schema._def.innerType)} | undefined`;
    case 'ZodNullable':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `${zodToTs(schema._def.innerType)} | null`;
    case 'ZodUnion':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return (schema._def.options as any[]).map(zodToTs).join(' | ');
    case 'ZodObject': {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const shape: Record<string, any> = schema._def.shape();
      const lines = Object.keys(shape).map((k) => {
        const v = shape[k];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const opt = v?._def?.typeName === 'ZodOptional' ? '?' : '';
        return `${k}${opt}: ${zodToTs(v)}`;
      });
      return `{ ${lines.join('; ')} }`;
    }
    case 'ZodRecord':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `Record<string, ${zodToTs(schema._def.valueType)}>`;
    case 'ZodTuple':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `[${(schema._def.items as any[]).map(zodToTs).join(', ')}]`;
    case 'ZodUnknown':
    case 'ZodAny':
      return 'unknown';
    default:
      return 'unknown';
  }
}
