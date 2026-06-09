export interface TypeRef {
  name: string;
  filePath: string;
  isArray?: boolean;
}

export type FieldTypeKind = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'unknown';

export interface FilterFieldType {
  /** Field name, e.g. 'age' or 'tasks.id' (dot-notation for relations). */
  name: string;
  kind: FieldTypeKind;
  /** String/number-literal union members (enums), if any. */
  enumValues?: string[];
  /** Whether the field's TS type includes null/undefined. */
  nullable?: boolean;
  /** True when enumValues are numeric literals (emit unquoted). */
  numericEnum?: boolean;
}

export interface ContractSource {
  query: string | null;
  body: string | null;
  response: string;
  queryRef?: TypeRef | null;
  bodyRef?: TypeRef | null;
  responseRef?: TypeRef | null;
  filterFields?: string[] | null;
  filterFieldTypes?: FilterFieldType[] | null;
  filterSource?: 'body' | 'query' | null;
}

export interface ContractDescriptor {
  contractSource: ContractSource;
}

export interface ControllerRef {
  className: string;
  methodName: string;
  filePath: string;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
  contract?: ContractDescriptor;
  controllerRef?: ControllerRef;
}
